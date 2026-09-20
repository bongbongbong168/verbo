<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Scan;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class ScanTranslationController extends Controller
{
    public function store(Request $request, Scan $scan)
    {
        abort_unless((int) $scan->user_id === (int) $request->user()->id, 403);
        $text = trim($scan->raw_text ?? '');
        abort_if($text === '', 422, 'There is no text to translate.');
        abort_if(strlen($text) > 60000, 422, 'This document is too long. Scan a smaller section to translate.');
        $sentences = $this->sentences($text);
        $cacheKey = 'scan-translation:v3:'.$scan->user_id.':'.$scan->id.':'.hash('sha256', $text);
        if ($pairs = Cache::get($cacheKey)) {
            return ['pairs' => $pairs];
        }
        $key = config('services.deepl.key');
        abort_unless($key, 503, 'Translation is not configured yet.');

        // Free endpoint only. Never retry automatically and spend quota twice.
        try {
            $response = Http::withHeaders(['Authorization' => 'DeepL-Auth-Key '.$key])
                ->connectTimeout(5)->timeout(30)
                ->post('https://api-free.deepl.com/v2/translate', [
                    // Each entry comes back in this same order, letting the
                    // reader put the English directly below its Chinese line.
                    'text' => $sentences,
                    'source_lang' => 'ZH',
                    'target_lang' => 'EN-US',
                    'split_sentences' => 'nonewlines',
                ]);
        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            abort(503, 'Translation could not connect. Please try again later.');
        }
        abort_if($response->status() === 456, 503, 'The translation allowance has been used up. Please try again next month.');
        abort_if($response->status() === 429, 503, 'Translation is busy. Please try again shortly.');
        abort_unless($response->successful(), 503, 'Translation is unavailable. Please try again later.');
        $translations = collect($response->json('translations', []))->pluck('text')->values();
        abort_unless($translations->count() === count($sentences) && $translations->every(fn ($value) => is_string($value) && trim($value) !== ''), 503, 'No translation was returned. Please try again.');
        $pairs = collect($sentences)->values()->map(fn ($source, $index) => [
            'source' => $source,
            'translation' => $translations[$index],
        ])->all();
        Cache::put($cacheKey, $pairs, now()->addDays(30));
        return ['pairs' => $pairs];
    }

    /** Keep punctuation on its sentence, including a closing quote after it. */
    private function sentences(string $text): array
    {
        // OCR usually separates a title from the story with a blank line.
        // That title needs its own translation, not to be glued to sentence 1.
        return collect(preg_split('/\R\s*\R/u', trim($text)))
            ->flatMap(function ($paragraph) {
                preg_match_all('/.*?(?:[。！？!?]+[”’）】〕》]*|$)/us', $paragraph, $matches);
                return $matches[0];
            })
            ->map(fn ($sentence) => trim($sentence))
            ->filter()
            ->values()
            ->all();
    }
}
