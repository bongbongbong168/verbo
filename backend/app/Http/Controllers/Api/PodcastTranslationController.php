<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class PodcastTranslationController extends Controller
{
    public function store(Request $request)
    {
        abort_unless($request->user()->is_admin, 403);
        $data = $request->validate(['text' => ['required', 'string', 'max:60000']]);
        $text = trim($data['text']);
        abort_if($text === '', 422, 'Add the Chinese transcript before translating it.');
        $key = config('services.deepl.key');
        abort_unless($key, 503, 'Translation is not configured yet.');
        $cacheKey = 'podcast-translation:v1:'.hash('sha256', $text);
        if ($translation = Cache::get($cacheKey)) return ['translation' => $translation];
        try {
            $response = Http::withHeaders(['Authorization' => 'DeepL-Auth-Key '.$key])
                ->connectTimeout(5)->timeout(30)->post('https://api-free.deepl.com/v2/translate', [
                    'text' => [$text], 'source_lang' => 'ZH', 'target_lang' => 'EN-US', 'split_sentences' => 'nonewlines',
                ]);
        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            abort(503, 'Translation could not connect. Please try again later.');
        }
        abort_if($response->status() === 456, 503, 'The translation allowance has been used up. Please try again next month.');
        abort_if($response->status() === 429, 503, 'Translation is busy. Please try again shortly.');
        abort_unless($response->successful(), 503, 'Translation is unavailable. Please try again later.');
        $translation = $response->json('translations.0.text');
        abort_unless(is_string($translation) && trim($translation) !== '', 503, 'No translation was returned. Please try again.');
        Cache::put($cacheKey, $translation, now()->addDays(30));
        return ['translation' => $translation];
    }
}
