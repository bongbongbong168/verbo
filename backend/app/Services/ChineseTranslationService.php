<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Keeps every Mandarin-to-English feature on one reliable provider path.
 *
 * DeepL remains the first choice. On this machine its Free endpoint can time
 * out before a TCP connection opens, so Gemini takes over without making a
 * learner wait or leaving a half-translated reader. A short outage cache
 * avoids paying that connection delay for every sentence during an outage.
 */
class ChineseTranslationService
{
    private const DEEPL_DOWN_CACHE = 'translation-provider:deepl-unavailable';

    public function translate(array $texts): array
    {
        $texts = array_values(array_map(fn ($text) => trim((string) $text), $texts));
        if ($texts === [] || array_filter($texts, fn ($text) => $text === '')) {
            throw new RuntimeException('There is no Chinese text to translate.');
        }

        if (filled(config('services.deepl.key')) && ! Cache::get(self::DEEPL_DOWN_CACHE)) {
            try {
                return $this->deepL($texts);
            } catch (\Throwable $e) {
                Cache::put(self::DEEPL_DOWN_CACHE, true, now()->addMinutes(5));
                Log::notice('DeepL translation unavailable; using Gemini fallback', [
                    'message' => $e->getMessage(),
                ]);
            }
        }

        if (filled(config('services.gemini.key'))) {
            return $this->gemini($texts);
        }

        throw new RuntimeException('Translation is temporarily unavailable. Please try again later.');
    }

    private function deepL(array $texts): array
    {
        $response = Http::withHeaders([
            'Authorization' => 'DeepL-Auth-Key '.config('services.deepl.key'),
        ])->connectTimeout(5)->timeout(30)->post('https://api-free.deepl.com/v2/translate', [
            'text' => $texts,
            'source_lang' => 'ZH',
            'target_lang' => 'EN-US',
            'split_sentences' => 'nonewlines',
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('DeepL returned HTTP '.$response->status().'.');
        }

        return $this->valid(collect($response->json('translations', []))->pluck('text')->all(), count($texts));
    }

    private function gemini(array $texts): array
    {
        $model = config('services.gemini.model');
        try {
            $response = Http::withHeaders(['x-goog-api-key' => config('services.gemini.key')])
                ->asJson()->connectTimeout(10)->timeout(45)
                ->post("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent", [
                    'contents' => [[
                        'parts' => [[
                            'text' => "Translate every Simplified Chinese entry into concise, natural English. Return only JSON in this exact shape: {\"translations\":[\"first\",\"second\"]}. Keep the same order and return exactly one English string per input.\n\nInput JSON:\n".json_encode($texts, JSON_UNESCAPED_UNICODE),
                        ]],
                    ]],
                    'generationConfig' => [
                        'temperature' => 0,
                        'responseMimeType' => 'application/json',
                    ],
                ]);
        } catch (\Throwable $e) {
            throw new RuntimeException('Translation could not connect. Please try again later.');
        }

        if (! $response->successful()) {
            Log::warning('Gemini translation fallback failed', ['status' => $response->status(), 'body' => $response->body()]);
            throw new RuntimeException('Translation is temporarily unavailable. Please try again later.');
        }

        $json = json_decode((string) data_get($response->json(), 'candidates.0.content.parts.0.text', ''), true);
        return $this->valid(is_array($json) ? ($json['translations'] ?? []) : [], count($texts));
    }

    private function valid(array $translations, int $count): array
    {
        $translations = array_values($translations);
        if (count($translations) !== $count || array_filter($translations, fn ($text) => ! is_string($text) || trim($text) === '')) {
            throw new RuntimeException('No translation was returned. Please try again.');
        }

        return array_map(fn ($text) => trim($text), $translations);
    }
}
