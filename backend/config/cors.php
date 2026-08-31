<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    /*
     * The dev server, plus whatever origins the deployment allows.
     *
     * Driven by env rather than hard-coded so the Vercel URL can be added
     * without a code change — but still an explicit ALLOW-LIST, never `*`.
     * A wildcard here would let any site on the internet call this API with a
     * user's bearer token if it ever got hold of one.
     *
     * FRONTEND_URL takes one origin (the production site); FRONTEND_URLS takes
     * a comma-separated list, which is what Vercel's per-branch preview
     * deployments need. Blank entries are dropped so a trailing comma cannot
     * silently insert an empty origin.
     */
    'allowed_origins' => array_values(array_filter(array_map(
        /* Cast before trimming. An unset FRONTEND_URL is null, and PHP 8.2
           deprecates passing null to trim() — which surfaced as a deprecation
           notice on every request in the production build. */
        fn ($origin) => trim((string) $origin),
        array_merge(
            ['http://localhost:5173'],
            [env('FRONTEND_URL')],
            explode(',', (string) env('FRONTEND_URLS', ''))
        )
    ))),

    /*
     * Vercel gives every preview build its own hostname
     * (verbo-git-<branch>-<team>.vercel.app), so listing them one by one is not
     * possible. Set FRONTEND_URL_PATTERN to a regex to allow them as a family.
     * Left empty by default — a pattern is a broader grant than a list and
     * should be a deliberate choice.
     */
    'allowed_origins_patterns' => array_values(array_filter([
        env('FRONTEND_URL_PATTERN'),
    ])),

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
