<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * The Chinese practice assistant's one call out to Gemini.
 *
 * THE KEY NEVER REACHES THE BROWSER. The widget talks to Laravel, Laravel
 * talks to Google. A `VITE_GEMINI_KEY` would be readable by anyone who opened
 * the network tab and would be spent by anyone who found it — same rule as
 * `GOOGLE_SAFE_BROWSING_KEY`, and the opposite of `GOOGLE_CLIENT_ID`, which is
 * public by design.
 *
 * UNLIKE SafeBrowsingService, THIS FAILS CLOSED. That service guards a rare
 * threat while messaging is the product, so an outage there must not stop
 * anyone talking. Here the answer IS the product: a learner who asks a
 * question and silently gets nothing has been lied to, so a failure returns a
 * plain error the widget can show. The only thing that stays quiet is the
 * detail — an upstream body can carry key fragments and quota internals, so it
 * is logged rather than returned.
 */
class GeminiService
{
    private const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

    /** How much of the conversation is sent back each turn. */
    public const MAX_HISTORY = 12;

    /**
     * What the assistant is for, in its own words.
     *
     * Written as a teaching brief rather than "you are a helpful assistant":
     * the six jobs named in the brief are listed explicitly, and the reply
     * shape is pinned so the widget's bubbles stay readable rather than
     * arriving as a wall of prose. Pinyin with TONE MARKS, never numbers —
     * that is what the rest of the app renders (see DictionaryService, which
     * uses overtrue/pinyin for the same reason).
     */
    public const SYSTEM_PROMPT = <<<'TXT'
    You are Verbo's Chinese practice partner. The learner is studying Mandarin
    and is somewhere between complete beginner and HSK 5.

    What you help with:
    - Conversation practice in Chinese
    - Correcting grammar, and saying briefly WHY it was wrong
    - Pinyin, always with tone marks (nǐ hǎo), never numbers (ni3 hao3)
    - English translation
    - Explaining vocabulary
    - Suggesting what a native speaker would more naturally say

    How to answer:
    - Keep it SHORT. This is a small chat window, not an essay. Two or three
      lines is usually right.
    - When the learner writes Chinese that could be more natural, lead with the
      better version, then pinyin, then the English.
    - Always give pinyin and English for any Chinese you write, so a beginner
      is never stuck on a line they cannot read.
    - Use simplified characters.
    - Match their level: if they write in English, they are probably a
      beginner, so keep the Chinese simple and explain more.
    - Never invent a word or a usage you are unsure of. Say you are unsure.
    - No markdown headings, no tables, no code fences. Plain short lines.
    TXT;

    /** A fresh checkout has no key and must stay fully usable without one. */
    public static function configured(): bool
    {
        return filled(config('services.gemini.key'));
    }

    /**
     * One turn of the conversation.
     *
     * @param  array<int, array{role: string, text: string}>  $history
     *         Oldest first, INCLUDING the message just sent. Roles are 'user'
     *         and 'model' — Gemini's own words, mapped at the controller so
     *         the client never has to know them.
     * @param  string|null  $topic  The quick-topic chip, if one is chosen.
     * @return array{ok: bool, reply?: string, error?: string}
     */
    public function reply(array $history, ?string $topic = null): array
    {
        if (! self::configured()) {
            return [
                'ok' => false,
                'error' => 'The practice assistant is not set up on this server yet.',
            ];
        }

        $model = config('services.gemini.model');

        try {
            $response = Http::timeout(config('services.gemini.timeout'))
                ->asJson()
                ->post(self::ENDPOINT."/{$model}:generateContent?key=".config('services.gemini.key'), [
                    'systemInstruction' => [
                        'parts' => [['text' => $this->brief($topic)]],
                    ],
                    'contents' => $this->contents($history),
                    'generationConfig' => [
                        // Low, not zero: a practice partner that answers the
                        // same sentence identically every time stops feeling
                        // like a conversation, but a language tutor inventing
                        // grammar is worse than a dull one.
                        'temperature' => 0.6,
                        // The window is small and the brief says keep it short;
                        // this is the backstop if the model ignores that.
                        'maxOutputTokens' => 600,
                    ],
                ]);
        } catch (\Throwable $e) {
            Log::warning('Gemini request failed', ['message' => $e->getMessage()]);

            return ['ok' => false, 'error' => 'Could not reach the assistant. Try again in a moment.'];
        }

        if (! $response->successful()) {
            // The body can carry key fragments and quota internals, so it is
            // logged and never returned.
            Log::warning('Gemini returned an error', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return [
                'ok' => false,
                'error' => $response->status() === 429
                    ? 'The assistant is busy right now. Try again in a moment.'
                    : 'The assistant could not answer that. Try again in a moment.',
            ];
        }

        $text = trim((string) data_get($response->json(), 'candidates.0.content.parts.0.text', ''));

        if ($text === '') {
            /*
             * An empty candidate is usually a safety block, and the reason
             * lives in a different field than the text. Reported as "could not
             * answer" rather than as a failure, because nothing broke.
             */
            Log::info('Gemini returned no text', [
                'finish' => data_get($response->json(), 'candidates.0.finishReason'),
            ]);

            return ['ok' => false, 'error' => 'The assistant had nothing to say to that. Try rephrasing.'];
        }

        return ['ok' => true, 'reply' => $text];
    }

    /** The system brief, plus the chosen topic if there is one. */
    private function brief(?string $topic): string
    {
        if (! $topic) {
            return self::SYSTEM_PROMPT;
        }

        return self::SYSTEM_PROMPT."\n\nThe learner picked the topic: {$topic}. Steer the practice towards it without announcing that you are doing so.";
    }

    /**
     * History in Gemini's shape, trimmed to the last few turns.
     *
     * Trimmed because every turn is re-sent on every request, so an
     * hour-long chat would grow the cost of each message without bound. The
     * window keeps the thread coherent; it is not a memory.
     */
    private function contents(array $history): array
    {
        return collect($history)
            ->slice(-self::MAX_HISTORY)
            ->map(fn ($turn) => [
                'role' => $turn['role'] === 'model' ? 'model' : 'user',
                'parts' => [['text' => $turn['text']]],
            ])
            ->values()
            ->all();
    }
}
