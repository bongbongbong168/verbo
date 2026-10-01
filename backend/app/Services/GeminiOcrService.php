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
 * CHINESE ONLY, AND IT ONLY TRANSCRIBES. Scan exists to find Chinese to learn,
 * so English lines, logos and UI labels are left out rather than cluttering the
 * document and the word list.
 *
 * It only transcribes. The prompt forbids translation, pinyin and commentary,
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
    Transcribe the CHINESE text in this image or document (every page, in order).

    Rules:
    - Output ONLY Chinese text. Leave out any line that is entirely English or
      another language, and leave out logos, watermarks, page numbers and UI
      labels that are not Chinese.
    - Keep numbers, prices and units that are part of a Chinese phrase
      (for example 38元, 3楼, 10点).
    - Keep the original characters exactly. Do not translate. Do not add pinyin.
      Do not correct or rewrite the text.
    - Use Chinese full-width punctuation (，。：；！？“”（）) and never put spaces
      between Chinese characters.
    - Keep the reading order. Put each separate line, heading or menu item on
      its own line, and leave one blank line between separate paragraphs or
      sections.
    - Output only the text: no introduction, no explanation, no markdown, no
      code fences.
    - If there is no Chinese text at all, output nothing.
    - If you cannot read a line with confidence (blurred, cut off, partly
      hidden), still give your best reading, but start that line with [?]
      followed by a space. Mark only lines you are genuinely unsure of.
    TXT;

    /** The mark the prompt asks for on a line Gemini could not read surely. */
    public const UNSURE = '[?]';

    public static function isPdf(string $path): bool
    {
        return is_readable($path) && mime_content_type($path) === 'application/pdf';
    }

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
        $pdf = self::isPdf($imagePath);
        $model = config('services.gemini.ocr_model') ?: config('services.gemini.model');

        try {
            $response = GeminiHttp::generate($model, [
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
                        // A PDF can run many pages; a photo is one.
                        'maxOutputTokens' => $pdf ? 16384 : 4096,
                        // Thinking spends the same budget; transcription needs none.
                        'thinkingConfig' => ['thinkingLevel' => 'minimal'],
                    ],
                ], (int) config('services.gemini.ocr_timeout', 30) * ($pdf ? 3 : 1));
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

        $text = self::clean($text);

        /* Cut off by the token limit: the last line may be half a line, so it
           is flagged for the learner to check rather than passed off as read. */
        if (data_get($candidate, 'finishReason') === 'MAX_TOKENS' && $text !== '') {
            $lines = explode("\n", $text);
            $last = count($lines) - 1;
            if (! str_starts_with(ltrim($lines[$last]), self::UNSURE)) {
                $lines[$last] = self::UNSURE.' '.$lines[$last];
            }
            $text = implode("\n", $lines);
        }

        return $text;
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
