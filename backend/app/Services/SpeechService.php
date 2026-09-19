<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Natural Mandarin audio for Study, from Gemini's TTS model.
 *
 * GENERATED ONCE, THEN SERVED AS A FILE. A clip is keyed by a hash of exactly
 * what shaped it - model, voice, the style brief and the text - and saved on
 * the public disk (the Railway volume in production). Every later play is a
 * plain static file: no request to Google, no quota spent. Editing a line
 * changes its text and therefore its hash, so a stale clip can never be
 * served for new text; the old file is simply never asked for again. The same
 * word in two units shares one clip.
 *
 * THE KEY STAYS ON THE SERVER, the same GEMINI_API_KEY the practice assistant
 * uses, sent as a header (see GeminiService for why never the query string).
 *
 * FAILS SOFT. No key, a quota refusal or an outage returns null and the page
 * falls back to the browser's own voice - a missing clip must never make a
 * word unplayable.
 *
 * Gemini returns raw 16-bit mono PCM (24kHz), which no browser plays as-is, so
 * it is wrapped in a WAV header here. There is no encoder on the server for
 * mp3, and a word is ~50KB as WAV, which is fine for files served once each.
 */
class SpeechService
{
    private const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

    private const DIR = 'speech';

    /** The style brief per kind of text. Part of the hash, so changing one
     *  regenerates those clips rather than mixing two styles on one page. */
    private const STYLES = [
        'word' => 'Say this Mandarin Chinese word slowly and clearly, like a friendly Mandarin teacher, with careful tones: ',
        'line' => 'Read this Mandarin Chinese sentence naturally and clearly, at a slightly slow pace for a learner, like a friendly Mandarin teacher: ',
    ];

    /** Set after Google answers 429, for as long as it asked us to wait. */
    private const COOLDOWN_KEY = 'speech:cooldown';

    public static function configured(): bool
    {
        return GeminiService::configured();
    }

    /**
     * The public URL of a clip that already exists, or null. Cheap: a stat.
     * `$voice` is 'boy', 'girl' or null for the default (teacher) voice.
     */
    public function existingUrl(string $text, string $kind, ?string $voice = null): ?string
    {
        $path = $this->path($text, $kind, $voice);

        return Storage::disk('public')->exists($path) ? Storage::disk('public')->url($path) : null;
    }

    /** The clip's URL, generating and saving it first if it does not exist. */
    public function urlFor(string $text, string $kind, ?string $voice = null): ?string
    {
        $text = trim($text);
        if ($text === '' || ! isset(self::STYLES[$kind]) || ! self::configured()) {
            return null;
        }

        if ($url = $this->existingUrl($text, $kind, $voice)) {
            return $url;
        }

        /* The free tier allows 3 requests a minute. Once Google has said
           "retry in 36s", asking again before then only earns another 429,
           so this answers "not now" at once and the page uses the browser's
           voice for that play. */
        if (Cache::has(self::COOLDOWN_KEY)) {
            return null;
        }

        $audio = $this->synthesize(self::STYLES[$kind].$text, $this->voiceName($voice));
        if ($audio === null) {
            return null;
        }

        $path = $this->path($text, $kind, $voice);
        Storage::disk('public')->put($path, $audio);

        return Storage::disk('public')->url($path);
    }

    public static function coolingDown(): bool
    {
        return Cache::has(self::COOLDOWN_KEY);
    }

    public function path(string $text, string $kind, ?string $voice = null): string
    {
        $key = implode('|', [$this->model(), $this->voiceName($voice), self::STYLES[$kind] ?? $kind, trim($text)]);

        return self::DIR.'/'.sha1($key).'.wav';
    }

    private function model(): string
    {
        return config('services.gemini.tts_model');
    }

    private function voiceName(?string $voice): string
    {
        return match ($voice) {
            'boy' => config('services.gemini.tts_voice_boy'),
            'girl' => config('services.gemini.tts_voice_girl'),
            default => config('services.gemini.tts_voice'),
        };
    }

    /** One request to Gemini; the WAV bytes, or null on any failure. */
    private function synthesize(string $prompt, string $voiceName): ?string
    {
        try {
            $response = Http::timeout(config('services.gemini.tts_timeout'))
                ->withHeaders(['x-goog-api-key' => config('services.gemini.key')])
                ->asJson()
                ->post(self::ENDPOINT.'/'.$this->model().':generateContent', [
                    'contents' => [['parts' => [['text' => $prompt]]]],
                    'generationConfig' => [
                        'responseModalities' => ['AUDIO'],
                        'speechConfig' => [
                            'voiceConfig' => [
                                'prebuiltVoiceConfig' => ['voiceName' => $voiceName],
                            ],
                        ],
                    ],
                ]);
        } catch (\Throwable $e) {
            Log::warning('Gemini TTS request failed', ['message' => GeminiService::redact($e->getMessage())]);

            return null;
        }

        if ($response->status() === 429) {
            preg_match('/retry in ([0-9.]+)s/i', $response->body(), $wait);
            $seconds = (int) ceil((float) ($wait[1] ?? 30)) + 1;
            Cache::put(self::COOLDOWN_KEY, true, now()->addSeconds($seconds));
        }

        if (! $response->successful()) {
            // The body can carry quota internals; logged, never returned.
            Log::warning('Gemini TTS refused', [
                'status' => $response->status(),
                'body' => GeminiService::redact(mb_substr($response->body(), 0, 500)),
            ]);

            return null;
        }

        $part = collect($response->json('candidates.0.content.parts', []))
            ->first(fn ($p) => isset($p['inlineData']['data']));
        if (! $part) {
            Log::warning('Gemini TTS returned no audio');

            return null;
        }

        $pcm = base64_decode($part['inlineData']['data'], true);
        if ($pcm === false || $pcm === '') {
            return null;
        }

        preg_match('/rate=(\d+)/', $part['inlineData']['mimeType'] ?? '', $m);
        $rate = isset($m[1]) ? (int) $m[1] : 24000;

        return self::wav(self::trimSilence($pcm, $rate), $rate);
    }

    /**
     * Cut the silence the model leaves at each end, keeping a short pad.
     * A word clip came back 2.5s long for well under a second of speech, and
     * that dead lead-in is what makes a play button feel slow to answer.
     */
    public static function trimSilence(string $pcm, int $rate, int $threshold = 600, float $padSeconds = 0.08): string
    {
        $samples = intdiv(strlen($pcm), 2);
        if ($samples === 0) {
            return $pcm;
        }
        $at = fn (int $i) => unpack('s', substr($pcm, $i * 2, 2))[1];

        $first = 0;
        while ($first < $samples && abs($at($first)) < $threshold) {
            $first++;
        }
        if ($first === $samples) {
            return $pcm; // all quiet: leave it rather than return nothing
        }
        $last = $samples - 1;
        while ($last > $first && abs($at($last)) < $threshold) {
            $last--;
        }

        $pad = (int) round($padSeconds * $rate);
        $start = max(0, $first - $pad);
        $end = min($samples - 1, $last + $pad);

        return substr($pcm, $start * 2, ($end - $start + 1) * 2);
    }

    /** Wrap raw 16-bit little-endian mono PCM in a RIFF/WAVE header. */
    public static function wav(string $pcm, int $rate = 24000, int $channels = 1, int $bits = 16): string
    {
        $blockAlign = $channels * $bits / 8;
        $byteRate = $rate * $blockAlign;
        $size = strlen($pcm);

        return 'RIFF'.pack('V', 36 + $size).'WAVE'
            .'fmt '.pack('VvvVVvv', 16, 1, $channels, $rate, $byteRate, $blockAlign, $bits)
            .'data'.pack('V', $size).$pcm;
    }
}
