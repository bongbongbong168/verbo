<?php

namespace App\Support;

class YouTubeVideo
{
    /**
     * Extract a standard 11-character YouTube video ID from a public or
     * unlisted YouTube URL. This deliberately needs no YouTube API request.
     */
    public static function idFromUrl(?string $url): ?string
    {
        $url = trim((string) $url);

        if ($url === '') {
            return null;
        }

        if (! preg_match('#^https?://#i', $url)) {
            $url = 'https://'.$url;
        }

        $parts = parse_url($url);
        $host = strtolower((string) ($parts['host'] ?? ''));
        $host = preg_replace('/^www\./', '', $host);
        $path = trim((string) ($parts['path'] ?? ''), '/');
        $id = null;

        if ($host === 'youtu.be') {
            $id = explode('/', $path)[0] ?? null;
        } elseif (in_array($host, ['youtube.com', 'm.youtube.com', 'music.youtube.com'], true)) {
            parse_str((string) ($parts['query'] ?? ''), $query);
            $segments = array_values(array_filter(explode('/', $path)));

            if (($segments[0] ?? null) === 'watch') {
                $id = $query['v'] ?? null;
            } elseif (in_array($segments[0] ?? null, ['embed', 'shorts', 'live'], true)) {
                $id = $segments[1] ?? null;
            }
        }

        return is_string($id) && preg_match('/^[A-Za-z0-9_-]{11}$/', $id) ? $id : null;
    }

    public static function watchUrl(string $videoId): string
    {
        return 'https://www.youtube.com/watch?v='.$videoId;
    }
}
