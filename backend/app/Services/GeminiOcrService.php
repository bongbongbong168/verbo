<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Read the text in a photo with Gemini.
 *
 * Tesseract's Chinese model is the weak link in Scan: it needs a flat, sharp,
 * high-contrast page, and a real phone photo of a menu or a sign - tilted,
 * blurred, Chinese mixed with English - comes back as fragments or noise.
 * Gemini reads those well, so it goes first.
 *
 * IT ONLY TRANSCRIBES. The prompt forbids translation, pinyin and commentary,
 * because the rest of Scan (segmentation, pinyin, meanings) comes from the
 * app's own CC-CEDICT pipeline, exactly as Read, Podcast and Study do. Letting
 * the model supply meanings here would give scanned words a second, different
 * source of truth from every other page.
 *
 * UNLIKE GeminiService, THIS FAILS OPEN. The practice assistant fails closed
 * because its answer is the product. Here Tesseract is a working fallback, so
 * every failure - no key, a timeout, a 429 when the shared quota runs out, a
 * safety block - returns null and the caller reads the image the old way. A
 * scan should never break because a third party is having a bad day.
 *
 * Same key discipline as GeminiService: the key travels in a header, never
 * the URL, and upstream bodies are logged, never returned.
 */
class GeminiOcrService
{
    private const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

    private const PROMPT = <<<'TXT'
    Transcribe every piece of text visible in this image, exactly as written.

    Rules:
    - Output ONLY the text from the image. No introduction, no explanation, no
      notes, no markdown, no code fences.
    - Keep the original characters. Do not translate. Do not add pinyin.
    - Keep simplified or traditional characters as they appear.
    - Keep the reading order and put each separate line on its own line.
    - Include any English, numbers and punctuation that appear, as written.
    - If there is no readable text at all, output nothing.
    TXT;

    public static function configured(): bool
    {
        return GeminiService::configured();
    }

    /**
     * @return string|null The transcribed text ('' when the image genuinely
     *                     has none), or null when Gemini could not be used and
     *                     the caller should fall back.
     */
    public function extract(string $imagePath): ?string
    {
        if (! self::configured() || ! is_readable($imagePath)) {
            return null;
        }

        $mime = mime_content_type($imagePath) ?: 'image/jpeg';
        $model = config('services.gemini.ocr_model') ?: config('services.gemini.model');

        try {
            $response = Http::timeout(config('services.gemini.ocr_timeout', 30))
                ->withHeaders(['x-goog-api-key' => config('services.gemini.key')])
                ->asJson()
                ->post(self::ENDPOINT."/{$model}:generateContent", [
                    'contents' => [[
                        'role' => 'user',
                        'parts' => [
                            ['text' => self::PROMPT],
                            ['inline_data' => [
                                'mime_type' => $mime,
                                'data' => base64_encode(file_get_contents($imagePath)),
                            ]],
                        ],
                    ]],
                    'generationConfig' => [
                        // Zero: this is transcription, where the only right
                        // answer is the one in the picture.
                        'temperature' => 0,
                        'maxOutputTokens' => 4096,
                    ],
                ]);
        } catch (\Throwable $e) {
            Log::warning('Gemini OCR request failed, falling back to Tesseract', [
                'message' => preg_replace('/([?&]key=)[^&\s"\']+/i', '$1REDACTED', $e->getMessage()),
            ]);

            return null;
        }

        if (! $response->successful()) {
            Log::warning('Gemini OCR returned an error, falling back to Tesseract', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return null;
        }

        $candidate = data_get($response->json(), 'candidates.0');

        /* No candidate at all, or one stopped for safety, is "could not use
           Gemini", not "the image is blank" - fall back rather than save an
           empty scan. A normal STOP with no text IS a blank image. */
        if (! $candidate || ! in_array(data_get($candidate, 'finishReason', 'STOP'), ['STOP', 'MAX_TOKENS'], true)) {
            Log::info('Gemini OCR gave no usable candidate, falling back to Tesseract', [
                'finish' => data_get($candidate, 'finishReason'),
            ]);

            return null;
        }

        $text = collect(data_get($candidate, 'content.parts', []))
            ->pluck('text')
            ->filter()
            ->implode('');

        return self::clean($text);
    }

    /**
     * Strip what a model sometimes adds despite the prompt: a code fence
     * around the whole answer, and trailing whitespace on each line.
     */
    public static function clean(string $text): string
    {
        $text = trim($text);
        $text = preg_replace('/^```[a-zA-Z]*\s*\n?/', '', $text);
        $text = preg_replace('/\n?```$/', '', $text);

        return trim(implode("\n", array_map('rtrim', preg_split('/\r\n|\r|\n/', $text))));
    }
}
