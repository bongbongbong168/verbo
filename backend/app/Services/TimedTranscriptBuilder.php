<?php

namespace App\Services;

use InvalidArgumentException;

/**
 * Turn the transcriber's output into what the podcast player reads.
 *
 * tools/transcriber/process_podcast.py (WhisperX) writes text plus a time for
 * every CHARACTER. That is not yet anything a learner can use: Chinese has no
 * spaces, so a character is not a word, and nothing in that file says what a
 * word means. This class adds both, and it does it with the app's own
 * DictionaryService - the same CC-CEDICT segmentation, pinyin and meanings
 * that Read, Scan, Study and the plain transcript already show - so a word
 * reads identically on every page.
 *
 *   character times -> dictionary segmentation -> each word takes the span of
 *   its characters -> pinyin + meaning attached
 *
 * WhisperX's own word grouping is deliberately NOT trusted: for Chinese it is
 * a character per "word", so it has no opinion about 学习 being one word.
 *
 * NOTHING HERE IS ALLOWED TO BREAK THE TRANSCRIPT. A word with no dictionary
 * entry keeps its text and time with a null meaning; a word the aligner could
 * not place borrows the gap between its neighbours (marked `estimated`), or is
 * left untimed and simply not clickable. Only a file that is not a transcript
 * at all is refused.
 */
class TimedTranscriptBuilder
{
    public const FORMAT_VERSION = 1;

    private const MAX_SEGMENTS = 5000;

    private const MAX_SEGMENT_CHARS = 2000;

    public function __construct(private DictionaryService $dictionary)
    {
    }

    /**
     * @throws InvalidArgumentException with a message fit to show an admin
     */
    public function build(array $raw): array
    {
        if (($raw['version'] ?? null) !== self::FORMAT_VERSION) {
            throw new InvalidArgumentException('This file is not a transcript from process_podcast.py (unknown format version).');
        }

        $segments = $raw['segments'] ?? null;
        if (! is_array($segments) || $segments === []) {
            throw new InvalidArgumentException('The transcript has no segments - no speech was found in it.');
        }
        if (count($segments) > self::MAX_SEGMENTS) {
            throw new InvalidArgumentException('The transcript has too many segments to be one episode.');
        }

        $out = [];
        foreach ($segments as $segment) {
            if (! is_array($segment)) {
                continue;
            }
            foreach ($this->segment($segment) as $line) {
                $out[] = $line;
            }
        }

        if ($out === []) {
            throw new InvalidArgumentException('None of the transcript\'s segments contained any text.');
        }

        /* Start order, untimed segments last. The player's lookup assumes
           order, and a file edited by hand may not keep it. */
        usort($out, fn ($a, $b) => ($a['start'] ?? PHP_FLOAT_MAX) <=> ($b['start'] ?? PHP_FLOAT_MAX));

        return [
            'version' => self::FORMAT_VERSION,
            'language' => 'zh',
            'model' => is_string($raw['model'] ?? null) ? mb_substr($raw['model'], 0, 60) : null,
            'duration' => self::time($raw['duration'] ?? null),
            'segments' => $out,
        ];
    }

    /** Counts for the admin's status line: how much of it is actually timed. */
    public static function stats(array $transcript): array
    {
        $words = 0;
        $timed = 0;
        foreach ($transcript['segments'] ?? [] as $segment) {
            foreach ($segment['words'] ?? [] as $token) {
                if (($token['type'] ?? null) !== 'word') {
                    continue;
                }
                $words++;
                if (($token['start'] ?? null) !== null) {
                    $timed++;
                }
            }
        }

        return [
            'segments' => count($transcript['segments'] ?? []),
            'words' => $words,
            'timed_words' => $timed,
        ];
    }

    /* Half-width punctuation after a Chinese character becomes the full-width
       form Chinese text uses. Whisper writes "大家好,欢迎" with an ASCII comma.
       One character for one, so the timings stay index-aligned. */
    private const FULL_WIDTH = [',' => '，', '.' => '。', ':' => '：', ';' => '；', '!' => '！', '?' => '？'];

    /* Where a line ends. Whisper hands back ~30 second windows, which is a
       paragraph, not something to follow along with; the player shows one
       sentence per line instead. */
    private const SENTENCE_END = ['。', '！', '？', '!', '?'];

    /**
     * One Whisper window, cut into sentences.
     *
     * @return array[] zero or more lines
     */
    private function segment(array $segment): array
    {
        $text = is_string($segment['text'] ?? null) ? trim($segment['text']) : '';
        if ($text === '') {
            return [];
        }
        $text = mb_substr($text, 0, self::MAX_SEGMENT_CHARS);

        $chars = mb_str_split($text);
        $times = $this->charTimes($chars, is_array($segment['chars'] ?? null) ? $segment['chars'] : []);

        foreach ($chars as $i => $ch) {
            if (isset(self::FULL_WIDTH[$ch]) && $i > 0 && preg_match('/\p{Han}/u', $chars[$i - 1])) {
                $chars[$i] = self::FULL_WIDTH[$ch];
            }
        }

        $segStart = self::time($segment['start'] ?? null);
        $segEnd = self::time($segment['end'] ?? null);

        $lines = [];
        $from = 0;
        $count = count($chars);
        for ($i = 0; $i < $count; $i++) {
            $last = $i === $count - 1;
            if (! $last && ! in_array($chars[$i], self::SENTENCE_END, true)) {
                continue;
            }
            // A closing quote belongs with the sentence it closes.
            while (! $last && $i + 1 < $count && in_array($chars[$i + 1], ['”', '」', '’', '"', ')', '）'], true)) {
                $i++;
            }

            $pieceChars = array_slice($chars, $from, $i - $from + 1);
            $pieceTimes = array_slice($times, $from, $i - $from + 1);
            $from = $i + 1;

            $line = $this->line(
                implode('', $pieceChars),
                $pieceTimes,
                // Only the first and last line of a window may fall back on
                // the window's own bounds; inner lines take their characters'.
                $lines === [] ? $segStart : null,
                $from >= $count ? $segEnd : null
            );
            if ($line !== null) {
                $lines[] = $line;
            }
        }

        return $lines;
    }

    private function line(string $text, array $times, ?float $segStart, ?float $segEnd): ?array
    {
        // Trim the spaces between sentences without losing index alignment.
        while ($text !== '' && trim(mb_substr($text, 0, 1)) === '') {
            $text = mb_substr($text, 1);
            array_shift($times);
        }
        while ($text !== '' && trim(mb_substr($text, -1)) === '') {
            $text = mb_substr($text, 0, -1);
            array_pop($times);
        }
        if ($text === '') {
            return null;
        }

        $timed = array_values(array_filter($times));
        $segStart = $timed ? $timed[0]['start'] : $segStart;
        $segEnd = $timed ? max(array_column($timed, 'end')) : $segEnd;

        $tokens = [];
        $cursor = 0;
        foreach ($this->dictionary->annotate($text) as $token) {
            $length = mb_strlen($token['text']);

            if ($token['type'] !== 'word') {
                $tokens[] = ['type' => 'text', 'text' => $token['text']];
                $cursor += $length;

                continue;
            }

            $span = array_filter(
                array_slice($times, $cursor, $length),
                fn ($t) => $t !== null && $t['start'] !== null
            );
            $cursor += $length;

            $start = $span ? min(array_column($span, 'start')) : null;
            $end = $span ? max(array_map(fn ($t) => $t['end'] ?? $t['start'], $span)) : null;
            $scores = array_filter(array_column($span, 'score'), fn ($s) => $s !== null);

            $tokens[] = [
                'type' => 'word',
                'text' => $token['text'],
                'pinyin' => $token['pinyin'] ?? null,
                'translation' => $token['translation'] ?? null,
                'start' => $start,
                'end' => $end !== null && $start !== null ? max($end, $start) : null,
                'confidence' => $scores ? round(array_sum($scores) / count($scores), 2) : null,
            ];
        }

        $this->fillGaps($tokens, $segStart, $segEnd);

        $timedWords = array_values(array_filter($tokens, fn ($t) => $t['type'] === 'word' && $t['start'] !== null));

        return [
            'start' => $segStart ?? ($timedWords[0]['start'] ?? null),
            'end' => $segEnd ?? ($timedWords ? end($timedWords)['end'] : null),
            'text' => $text,
            // Reserved for a sentence translation. Nothing in the app
            // machine-translates, so it is null until one is authored.
            'translation' => null,
            'words' => $tokens,
        ];
    }

    /**
     * One timing (or null) per character of the text.
     *
     * The transcriber promises its `chars` list matches the text one-to-one,
     * but a hand-edited file may not, so the list is walked against the text
     * rather than zipped with it: a character that went missing costs only
     * its own timing instead of shifting every one after it.
     */
    private function charTimes(array $chars, array $aligned): array
    {
        $times = [];
        $j = 0;
        $n = count($aligned);

        foreach ($chars as $ch) {
            $k = $j;
            while ($k < $n && (! is_array($aligned[$k]) || ($aligned[$k]['char'] ?? null) !== $ch)) {
                $k++;
            }

            if ($k >= $n) {
                $times[] = null;

                continue;
            }

            $a = $aligned[$k];
            $start = self::time($a['start'] ?? null);
            $end = self::time($a['end'] ?? null);
            $score = is_numeric($a['score'] ?? null) ? (float) $a['score'] : null;

            $times[] = $start === null ? null : [
                'start' => $start,
                'end' => $end !== null ? max($end, $start) : $start,
                'score' => $score,
            ];
            $j = $k + 1;
        }

        return $times;
    }

    /**
     * Give an untimed word the gap between its timed neighbours.
     *
     * The aligner's vocabulary is Chinese characters, so digits and Latin
     * letters inside a Chinese sentence ("2024年", "AI") come back with no time
     * at all. Leaving them unclickable would put holes in the middle of
     * sentences; the silence between the words either side is almost always
     * where they were said. Marked `estimated` so nothing mistakes it for a
     * measurement.
     */
    private function fillGaps(array &$tokens, ?float $segStart, ?float $segEnd): void
    {
        $words = array_values(array_keys(array_filter($tokens, fn ($t) => $t['type'] === 'word')));
        $count = count($words);
        $pos = 0;

        while ($pos < $count) {
            if ($tokens[$words[$pos]]['start'] !== null) {
                $pos++;

                continue;
            }

            // A RUN of untimed words shares one gap, split by length, so two
            // of them in a row never claim the same moment.
            $runEnd = $pos;
            while ($runEnd + 1 < $count && $tokens[$words[$runEnd + 1]]['start'] === null) {
                $runEnd++;
            }

            $prevEnd = $pos > 0 ? $tokens[$words[$pos - 1]]['end'] : $segStart;
            $nextStart = $runEnd + 1 < $count ? $tokens[$words[$runEnd + 1]]['start'] : $segEnd;

            if ($prevEnd !== null && $nextStart !== null && $nextStart >= $prevEnd) {
                $lengths = [];
                for ($r = $pos; $r <= $runEnd; $r++) {
                    $lengths[] = max(1, mb_strlen($tokens[$words[$r]]['text']));
                }
                $total = array_sum($lengths);
                $at = $prevEnd;

                foreach (range($pos, $runEnd) as $n => $r) {
                    $share = ($nextStart - $prevEnd) * $lengths[$n] / $total;
                    $tokens[$words[$r]]['start'] = round($at, 3);
                    $tokens[$words[$r]]['end'] = round($at + $share, 3);
                    $tokens[$words[$r]]['estimated'] = true;
                    $at += $share;
                }
            }

            $pos = $runEnd + 1;
        }
    }

    private static function time($value): ?float
    {
        if (! is_numeric($value)) {
            return null;
        }
        $value = (float) $value;

        return is_finite($value) && $value >= 0 ? round($value, 3) : null;
    }
}
