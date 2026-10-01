<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

/**
 * A short practice quiz built from ONE article or podcast transcript.
 *
 * Only the piece's own Chinese text is sent - no account data at all - cut to
 * MAX_SOURCE_CHARS so one request stays small. The answer comes back as JSON
 * and is checked strictly: anything malformed is a failure, never half a quiz
 * saved to the table everyone shares.
 */
class ContentQuizService
{
    public const QUESTIONS = 5;

    public const MAX_SOURCE_CHARS = 6000;

    private const PROMPT = <<<'TXT'
    Write a short practice quiz for a learner of Mandarin, based ONLY on the
    Chinese text below. Make exactly 5 multiple-choice questions:
    3 about what the text says (comprehension) and 2 about a word used in it
    (vocabulary: its meaning in this text).

    Rules:
    - Write each question in simple English. Quote the Chinese word or phrase it
      is about where it helps.
    - Exactly 4 short options per question, one clearly correct.
    - "answer" is the 0-based index of the correct option.
    - "explanation" is ONE short English sentence saying why, quoting the text.
    - Never ask about anything that is not in the text.

    Return only JSON in exactly this shape:
    {"questions":[{"type":"comprehension","question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]}
    TXT;

    /**
     * @return array<int, array>|null  The questions, or null on any failure.
     */
    public function generate(string $source): ?array
    {
        if (! GeminiService::configured()) {
            return null;
        }

        $source = mb_substr(trim($source), 0, self::MAX_SOURCE_CHARS);
        if ($source === '') {
            return null;
        }

        try {
            $response = GeminiHttp::generate(config('services.gemini.model'), [
                'contents' => [['role' => 'user', 'parts' => [['text' => self::PROMPT."\n\nText:\n".$source]]]],
                'generationConfig' => [
                    'temperature' => 0.3,
                    'responseMimeType' => 'application/json',
                    'maxOutputTokens' => 2048,
                    'thinkingConfig' => ['thinkingLevel' => 'minimal'],
                ],
            ], (int) config('services.gemini.quiz_timeout', 30));
        } catch (\Throwable $e) {
            Log::warning('Quiz request failed', ['message' => GeminiService::redact($e->getMessage())]);

            return null;
        }

        if (! $response->successful()) {
            Log::warning('Quiz request returned an error', ['status' => $response->status()]);

            return null;
        }

        $text = (string) data_get($response->json(), 'candidates.0.content.parts.0.text', '');

        return self::parse($text);
    }

    /** Strictly-checked questions, or null if the model's JSON is not usable. */
    public static function parse(string $text): ?array
    {
        $text = preg_replace('/^```[a-z]*\s*|\s*```$/i', '', trim($text));
        $data = json_decode($text, true);
        $raw = is_array($data) ? ($data['questions'] ?? null) : null;
        if (! is_array($raw)) {
            return null;
        }

        $questions = [];
        foreach ($raw as $q) {
            $options = $q['options'] ?? null;
            $answer = $q['answer'] ?? null;
            if (
                ! is_array($q)
                || ! is_string($q['question'] ?? null) || trim($q['question']) === ''
                || ! is_array($options) || count($options) !== 4
                || count(array_filter($options, fn ($o) => is_string($o) && trim($o) !== '')) !== 4
                || ! is_int($answer) || $answer < 0 || $answer > 3
            ) {
                return null;
            }
            $questions[] = [
                'type' => ($q['type'] ?? '') === 'vocabulary' ? 'vocabulary' : 'comprehension',
                'question' => trim($q['question']),
                'options' => array_map('trim', array_values($options)),
                'answer' => $answer,
                'explanation' => is_string($q['explanation'] ?? null) ? trim($q['explanation']) : '',
            ];
        }

        return count($questions) >= 3 ? array_slice($questions, 0, self::QUESTIONS) : null;
    }
}
