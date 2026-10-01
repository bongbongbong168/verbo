<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * The one way this app calls Gemini's generateContent.
 *
 * It exists for the RETRY RULE, so the four callers (chat, OCR, translation,
 * Study speech) cannot each get it slightly wrong:
 *
 *  - A TRANSIENT failure - the connection dropped or timed out, or Google
 *    answered 500/502/503/504 - is tried again, at most `retries` more times,
 *    with a short pause (BACKOFF_MS) between tries. Bounded, so one learner's
 *    request can never become an unbounded run of paid calls.
 *  - A 429 is NEVER retried. It means the quota is spent; asking again at once
 *    only earns another 429 and burns the minute's allowance for everyone.
 *  - Any other 4xx is never retried either: the request itself is wrong, and
 *    it will be wrong the second time too.
 *
 * The key travels in a header, never the URL (see GeminiService for why).
 * The response is returned whatever its status; callers decide what a failed
 * one means for them. A connection failure after the last attempt throws
 * ConnectionException, which every caller already catches.
 */
class GeminiHttp
{
    public const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

    /** Pause between tries. Fixed: this Laravel's retry() takes an int only. */
    public const BACKOFF_MS = 500;

    public static function generate(string $model, array $payload, int $timeout, ?int $retries = null): Response
    {
        $retries ??= (int) config('services.gemini.retries', 1);

        return Http::timeout($timeout)
            ->withHeaders(['x-goog-api-key' => config('services.gemini.key')])
            ->asJson()
            ->retry(
                $retries + 1,
                self::BACKOFF_MS,
                fn ($e) => self::transient($e),
                false
            )
            ->post(self::ENDPOINT."/{$model}:generateContent", $payload);
    }

    /** Worth trying again: a dropped connection or a server-side 5xx. */
    public static function transient($e): bool
    {
        if ($e instanceof ConnectionException) {
            return true;
        }

        return $e instanceof RequestException
            && in_array($e->response->status(), [500, 502, 503, 504], true);
    }
}
