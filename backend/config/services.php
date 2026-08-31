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

];
