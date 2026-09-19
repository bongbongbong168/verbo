<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    /*
     * Stripe. `key` is the publishable key and is sent to the browser; `secret`
     * and `webhook_secret` never leave the server.
     *
     * All three are absent from a fresh checkout by design — payments simply
     * stay in demo mode until they are filled in, rather than the app booting
     * into a half-configured state. `PaymentService::configured()` is what every
     * caller checks.
     */
    'stripe' => [
        'key' => env('STRIPE_KEY'),
        'secret' => env('STRIPE_SECRET'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
        // Prices across the app are whole dollars; Stripe works in the smallest
        // currency unit, so amounts are multiplied by 100 in one place only.
        'currency' => env('STRIPE_CURRENCY', 'usd'),
    ],

    /*
     * Google sign-in.
     *
     * Only the client id, and that is not an oversight: the app verifies an ID
     * token minted in the browser rather than running a redirect/callback
     * exchange, and that flow needs no client secret. The id is public by
     * design — it ships to the browser either way.
     *
     * The SAME value must reach the frontend as VITE_GOOGLE_CLIENT_ID, or the
     * browser will mint tokens for one audience while the server checks
     * another, and every sign-in will fail verification.
     */
    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
    ],

    /*
     * Google Safe Browsing — checks links people post in messages, comments,
     * reviews and tutor profiles.
     *
     * Absent from a fresh checkout, like Stripe and Google sign-in, and the app
     * stays fully usable without it: `SafeBrowsingService::configured()` gates
     * every call and an unconfigured install simply does not filter links.
     *
     * The key is a plain API key from the Google Cloud console with the Safe
     * Browsing API enabled. It is used server-side only and must NOT be given
     * a VITE_ twin — unlike GOOGLE_CLIENT_ID, this one is a secret.
     *
     * `clean_ttl` is how long a URL that came back clean is trusted before it
     * is asked about again. It trades quota against staleness: a URL clean
     * today can be flagged tomorrow, so this should stay in hours, not days.
     * `timeout` bounds how long a message send can wait on Google before the
     * check is abandoned and the content allowed through.
     */
    'safe_browsing' => [
        'key' => env('GOOGLE_SAFE_BROWSING_KEY'),
        'clean_ttl' => env('SAFE_BROWSING_CLEAN_TTL', 3600),
        'timeout' => env('SAFE_BROWSING_TIMEOUT', 4),
    ],

    /*
     * Gemini, behind the floating Chinese practice assistant.
     *
     * Server-side ONLY. This must never get a VITE_ twin — the browser talks
     * to Laravel and Laravel talks to Google, so the key is never shipped and
     * cannot be spent by whoever reads the bundle. Same rule and the same
     * `configured()` gate as safe_browsing above: a fresh checkout has no key
     * and the widget simply does not appear.
     *
     * Free keys come from Google AI Studio (aistudio.google.com) -> Get API
     * key. The flash model is the free tier's workhorse and is what a
     * two-or-three-line practice reply wants; a slower, pricier model would
     * buy nothing in a small chat window.
     *
     * The timeout is generous next to safe_browsing's 4s because a person is
     * watching a typing indicator and waiting for an answer, where that one
     * sits in the middle of someone sending a message.
     */
    /* The WhisperX podcast transcriber (tools/transcriber). Local only - it
       needs Python and ideally a GPU, neither of which production has. The
       defaults point at the venv the README creates beside this repo. */
    'transcriber' => [
        'python' => env('TRANSCRIBER_PYTHON', base_path('../tools/transcriber/.venv/'.(PHP_OS_FAMILY === 'Windows' ? 'Scripts/python.exe' : 'bin/python'))),
        'script' => env('TRANSCRIBER_SCRIPT', base_path('../tools/transcriber/process_podcast.py')),
        'model' => env('TRANSCRIBER_MODEL', 'large-v3'),
    ],

    'gemini' => [
        'key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-3-flash-preview'),
        'timeout' => env('GEMINI_TIMEOUT', 20),
        // Scan's reader. Defaults to the assistant's model; longer timeout
        // because an image upload is bigger than a chat turn. A failure here
        // falls back to Tesseract rather than failing the scan.
        // Study's spoken audio (SpeechService). Generated once per text and
        // saved, so the free tier's low rate limit only meets first plays.
        // The voice is any of Gemini's prebuilt voices (Kore, Puck, Leda...).
        'tts_model' => env('GEMINI_TTS_MODEL', 'gemini-3.1-flash-tts-preview'),
        // Words use the teacher voice; conversations give each speaker a
        // boy's or a girl's voice (StudyText::voiceFor).
        'tts_voice' => env('GEMINI_TTS_VOICE', 'Kore'),
        'tts_voice_boy' => env('GEMINI_TTS_VOICE_BOY', 'Puck'),
        'tts_voice_girl' => env('GEMINI_TTS_VOICE_GIRL', 'Leda'),
        'tts_timeout' => env('GEMINI_TTS_TIMEOUT', 30),
        'ocr_model' => env('GEMINI_OCR_MODEL'),
        'ocr_timeout' => env('GEMINI_OCR_TIMEOUT', 30),
    ],

    /*
     * Brevo — how verification and password-reset codes leave the server in
     * production. See App\Mail\BrevoTransport for why this exists at all:
     * Railway blocks every outbound SMTP port, so mail has to go over HTTPS.
     *
     * The timeout is short and deliberate. This app runs no queue, so the
     * send happens inside the user's own request — a provider having a slow
     * morning would otherwise hang someone's sign-up. Ten seconds, then it
     * fails soft and says so, which is the same courtesy Stripe, Safe
     * Browsing and Gemini get.
     */
    'brevo' => [
        'key' => env('BREVO_API_KEY'),
        'timeout' => env('BREVO_TIMEOUT', 10),
    ],

];
