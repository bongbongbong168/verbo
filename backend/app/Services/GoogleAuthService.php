<?php

namespace App\Services;

use Google\Auth\AccessToken;
use Illuminate\Support\Facades\Log;

/**
 * Everything that knows how to trust a Google sign-in.
 *
 * The browser runs Google Identity Services, which hands it an ID token — a
 * JWT signed by Google — and posts that here. This class checks the signature
 * against Google's published keys and then checks the claims.
 *
 * Chosen over the redirect/callback flow for two concrete reasons:
 *
 *  1. Verbo authenticates with Sanctum BEARER TOKENS, not cookies. A redirect
 *     flow has to get that token back to a SPA somehow, which in practice means
 *     putting it in the callback URL — where it lands in browser history, in
 *     the Referer header, and in any server log along the way.
 *  2. Verifying an ID token needs only the CLIENT ID, which is public by
 *     design. There is no client secret in this flow at all, so there is one
 *     less secret to hold, leak, or rotate.
 */
class GoogleAuthService
{
    /** Google's two accepted issuer spellings. Both are legitimate. */
    private const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

    /**
     * Is Google sign-in wired up at all?
     *
     * A fresh checkout has no client id, and the app must stay usable — the
     * login page renders the button disabled rather than offering a sign-in
     * that can only fail. Same pattern as PaymentService::configured().
     */
    public static function configured(): bool
    {
        return filled(config('services.google.client_id'));
    }

    /**
     * Verify an ID token and return the claims we trust, or null.
     *
     * Returns null rather than throwing on a bad token: a forged or expired
     * token is an ordinary 401, not a server fault, and the caller should not
     * have to tell those apart from a library error.
     *
     * @return array{sub: string, email: string, name: ?string, picture: ?string}|null
     */
    public function verify(string $idToken): ?array
    {
        if (! self::configured()) {
            return null;
        }

        try {
            // Checks the RS256 signature against Google's JWKS and that `aud`
            // is our client id — without the audience check, a token minted for
            // ANY other Google app would be accepted here, which is the classic
            // way this integration is got wrong.
            $payload = (new AccessToken())->verify($idToken, [
                'audience' => config('services.google.client_id'),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Google ID token failed verification', ['error' => $e->getMessage()]);

            return null;
        }

        if (! $payload) {
            return null;
        }

        // The library checks signature, audience and expiry. Issuer and the
        // email claims are ours to check.
        if (! in_array($payload['iss'] ?? '', self::ISSUERS, true)) {
            return null;
        }

        $email = $payload['email'] ?? null;

        /* email_verified is NOT optional here, and this is the security-
           critical line in the file. Sign-in matches an existing Verbo account
           by email address, so accepting an unverified one would let anyone who
           could put any address on a Google account walk into the matching
           Verbo account. */
        if (! $email || ! ($payload['email_verified'] ?? false)) {
            return null;
        }

        if (empty($payload['sub'])) {
            return null;
        }

        return [
            'sub' => (string) $payload['sub'],
            'email' => strtolower($email),
            'name' => $payload['name'] ?? null,
            'picture' => $payload['picture'] ?? null,
        ];
    }
}
