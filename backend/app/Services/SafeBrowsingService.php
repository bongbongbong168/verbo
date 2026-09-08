<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Checks links people post against Google Safe Browsing.
 *
 * Verbo has several places where one user's text is read by another — a
 * message to a tutor, a comment under an article, a review, a tutor's own bio
 * and intro video. Those are the places a phishing or malware link would be
 * planted, so they are the places this runs.
 *
 * THE LOOKUP API, NOT THE UPDATE API. The Update API downloads Google's hash
 * prefixes and matches locally, which keeps the URLs private but needs a
 * background job to maintain a local database — and this app runs no scheduler
 * or queue worker at all (see the Notifications section in CLAUDE.md). The
 * Lookup API is a single request with no state to maintain. The trade-off is
 * real and worth stating plainly: URLs users post are sent to Google. Only
 * URLs are sent, never the surrounding message text.
 *
 * THIS FAILS OPEN, DELIBERATELY. If the key is missing, the network is down,
 * Google is slow, or the daily quota is spent, content is ALLOWED through and
 * the failure is logged. The alternative fails closed and would mean nobody in
 * Verbo can send a message because a third party is having an outage — turning
 * someone else's downtime into total loss of communication here. A link filter
 * is a safety net over a threat that is rare; messaging is the product.
 */
class SafeBrowsingService
{
    /** The four threat lists Google exposes. All of them matter here. */
    private const THREAT_TYPES = [
        'MALWARE',
        'SOCIAL_ENGINEERING',        // phishing
        'UNWANTED_SOFTWARE',
        'POTENTIALLY_HARMFUL_APPLICATION',
    ];

    private const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

    /** Google accepts 500 URLs per request; one message will never approach it. */
    private const MAX_URLS_PER_REQUEST = 500;

    /**
     * Is Safe Browsing wired up at all?
     *
     * A fresh checkout has no key and must stay fully usable, exactly like
     * `PaymentService::configured()` and `GoogleAuthService::configured()`.
     * Every caller checks this rather than discovering it through a failed
     * request.
     */
    public static function configured(): bool
    {
        return filled(config('services.safe_browsing.key'));
    }

    /**
     * Pull candidate URLs out of free text.
     *
     * Three shapes are matched: an explicit scheme, a `www.` prefix, and a bare
     * `domain.tld`. The bare case is deliberately included even though it
     * over-matches things like "Node.js" — a false positive costs one cached
     * lookup that comes back clean, while a miss is a live malicious link. The
     * asymmetry is the whole point, so the regex errs toward matching.
     *
     * ASCII-anchored on purpose. Message bodies here are full of Chinese, and
     * the character classes must not run into CJK or the match will swallow the
     * sentence around the link.
     *
     * @return string[] unique, in first-seen order
     */
    public function extractUrls(string $text): array
    {
        $pattern = '~
            (?:
                https?://[^\s<>"\x{4e00}-\x{9fff}]+      # explicit scheme
              | www\.[^\s<>"\x{4e00}-\x{9fff}]+          # www, no scheme
              | (?<![\w.@])                              # bare domain.tld
                [a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?
                (?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*
                \.[a-z]{2,24}
                (?:/[^\s<>"\x{4e00}-\x{9fff}]*)?
            )
        ~uix';

        if (! preg_match_all($pattern, $text, $m)) {
            return [];
        }

        $urls = [];
        foreach ($m[0] as $raw) {
            // Trailing punctuation belongs to the sentence, not the link:
            // "see example.com." and "(example.com)" are both common.
            $url = rtrim($raw, '.,;:!?)]}\'"');
            if ($url === '') {
                continue;
            }
            // The API requires a scheme. Bare domains are assumed http; Google
            // canonicalises and matches host-level entries either way.
            if (! preg_match('~^https?://~i', $url)) {
                $url = 'http://' . $url;
            }
            $urls[$url] = true;
        }

        return array_slice(array_keys($urls), 0, self::MAX_URLS_PER_REQUEST);
    }

    /**
     * The first threat found in a block of free text, or null.
     *
     * @return array{url: string, threat: string}|null
     */
    public function firstThreatInText(string $text): ?array
    {
        $urls = $this->extractUrls($text);

        return $urls === [] ? null : $this->firstThreat($urls);
    }

    /**
     * The first threat among these URLs, or null if all are clean.
     *
     * Returns the first rather than all of them because every caller is about
     * to reject the whole submission anyway, and naming one bad link is a
     * clearer message than listing five.
     *
     * @param  string[]  $urls
     * @return array{url: string, threat: string}|null
     */
    public function firstThreat(array $urls): ?array
    {
        if ($urls === [] || ! self::configured()) {
            return null;
        }

        $unknown = [];
        foreach ($urls as $url) {
            $cached = Cache::get($this->cacheKey($url));
            if ($cached === null) {
                $unknown[] = $url;
                continue;
            }
            // Cached verdicts: '' means clean, anything else is the threat type.
            if ($cached !== '') {
                return ['url' => $url, 'threat' => $cached];
            }
        }

        if ($unknown === []) {
            return null;
        }

        $matches = $this->lookup($unknown);
        if ($matches === null) {
            return null;                 // request failed — fail open, already logged
        }

        // Record the clean ones so the next identical paste costs nothing. A
        // shortish window: a URL that is clean today can be flagged tomorrow,
        // and caching "safe" for a long time is how a filter goes quietly stale.
        $cleanTtl = (int) config('services.safe_browsing.clean_ttl', 3600);
        foreach ($unknown as $url) {
            if (! isset($matches[$url])) {
                Cache::put($this->cacheKey($url), '', $cleanTtl);
            }
        }

        foreach ($unknown as $url) {
            if (isset($matches[$url])) {
                return ['url' => $url, 'threat' => $matches[$url]];
            }
        }

        return null;
    }

    /**
     * One request to Google. Returns url => threatType for the bad ones,
     * an empty array when everything is clean, or NULL when the check could
     * not be performed at all — which the caller must treat as "allow".
     *
     * @param  string[]  $urls
     * @return array<string, string>|null
     */
    private function lookup(array $urls): ?array
    {
        $entries = [];
        foreach ($urls as $url) {
            $entries[] = ['url' => $url];
        }

        try {
            $response = Http::timeout((int) config('services.safe_browsing.timeout', 4))
                ->retry(1, 200, throw: false)
                ->post(self::ENDPOINT . '?key=' . urlencode(config('services.safe_browsing.key')), [
                    'client' => [
                        'clientId' => 'verbo',
                        'clientVersion' => '1.0.0',
                    ],
                    'threatInfo' => [
                        'threatTypes' => self::THREAT_TYPES,
                        'platformTypes' => ['ANY_PLATFORM'],
                        'threatEntryTypes' => ['URL'],
                        'threatEntries' => $entries,
                    ],
                ]);
        } catch (\Throwable $e) {
            // A timeout or DNS failure is not this app's fault and must not
            // become the user's problem. Log and let the content through.
            Log::warning('Safe Browsing lookup failed', ['error' => $e->getMessage()]);

            return null;
        }

        if ($response->failed()) {
            // 400 means we sent something malformed, 403 a bad or unbilled key,
            // 429 the quota. All are ours to fix and none should block a user.
            Log::warning('Safe Browsing returned an error', [
                'status' => $response->status(),
                'body' => mb_substr((string) $response->body(), 0, 500),
            ]);

            return null;
        }

        $found = [];
        foreach ((array) $response->json('matches', []) as $match) {
            $url = $match['threat']['url'] ?? null;
            if ($url === null) {
                continue;
            }
            $type = $match['threatType'] ?? 'UNSAFE';
            $found[$url] = $type;

            // Google tells us how long to trust a positive; honour it, with a
            // floor so a tiny value does not mean re-asking on every keystroke.
            $ttl = max(300, (int) rtrim((string) ($match['cacheDuration'] ?? '300s'), 's'));
            Cache::put($this->cacheKey($url), $type, $ttl);
        }

        return $found;
    }

    /** Hashed: a URL can be longer than a cache key may be, and may hold PII. */
    private function cacheKey(string $url): string
    {
        return 'sb:' . sha1($url);
    }

    /**
     * A human sentence for a threat type, for the message shown to whoever
     * pasted the link. Deliberately says what was found and does not accuse —
     * people forward bad links without knowing.
     */
    public static function describe(string $threat): string
    {
        switch ($threat) {
            case 'SOCIAL_ENGINEERING':
                return 'a known phishing site';
            case 'MALWARE':
                return 'a site known to distribute malware';
            case 'UNWANTED_SOFTWARE':
                return 'a site known to distribute unwanted software';
            case 'POTENTIALLY_HARMFUL_APPLICATION':
                return 'a site known to distribute harmful apps';
            default:
                return 'an unsafe site';
        }
    }
}
