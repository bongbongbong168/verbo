<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Overtrue\Pinyin\Pinyin;

class DictionaryService
{
    protected static ?array $index = null;

    /**
     * Pinyin conversion costs ~23ms per call, which dominates annotation:
     * a 700-character transcript is ~384 word tokens but only ~160 distinct
     * ones, so memoizing repeats cuts the work by more than half.
     */
    protected static array $pinyinCache = [];

    public function pinyinFor(string $word): string
    {
        return self::$pinyinCache[$word] ??= Pinyin::sentence($word)->join(' ');
    }

    public function lookup(string $word): ?string
    {
        $this->loadIndex();

        return self::$index[$word] ?? null;
    }

    /**
     * Greedy longest-match segmentation of Chinese text into dictionary words.
     * Falls back to single characters when no multi-character word matches.
     */
    public function segment(string $text): array
    {
        $this->loadIndex();

        $chars = mb_str_split($text);
        $count = count($chars);
        $maxWordLen = 6;
        $words = [];
        $i = 0;

        while ($i < $count) {
            $matchedWord = null;
            $matchedLen = 1;

            for ($len = min($maxWordLen, $count - $i); $len >= 1; $len--) {
                $candidate = implode('', array_slice($chars, $i, $len));
                if (isset(self::$index[$candidate])) {
                    $matchedWord = $candidate;
                    $matchedLen = $len;
                    break;
                }
            }

            $word = $matchedWord ?? $chars[$i];

            if (preg_match('/[\p{Han}]/u', $word)) {
                $words[] = $word;
            }

            $i += $matchedLen;
        }

        return $words;
    }

    /**
     * Tokenize full text for hover-translation display: Chinese words become
     * word tokens (with pinyin + translation), everything else (whitespace,
     * punctuation, non-Chinese text) passes through unchanged as text tokens
     * so the original formatting can be reproduced exactly.
     */
    public function annotate(string $text): array
    {
        // Annotating is expensive (pinyin conversion dominates) and entirely
        // deterministic, yet article/podcast/study text is read far more often
        // than it is edited. Key on a hash of the text so an edit naturally
        // produces a new key instead of needing explicit invalidation.
        return Cache::rememberForever(
            'dict.annotate.'.md5($text),
            fn () => $this->buildAnnotation($text)
        );
    }

    protected function buildAnnotation(string $text): array
    {
        $this->loadIndex();

        $chars = mb_str_split($text);
        $count = count($chars);
        $maxWordLen = 6;
        $tokens = [];
        $i = 0;

        while ($i < $count) {
            if (preg_match('/[\p{Han}]/u', $chars[$i])) {
                $matchedWord = null;
                $matchedLen = 1;

                for ($len = min($maxWordLen, $count - $i); $len >= 1; $len--) {
                    $candidate = implode('', array_slice($chars, $i, $len));
                    if (isset(self::$index[$candidate])) {
                        $matchedWord = $candidate;
                        $matchedLen = $len;
                        break;
                    }
                }

                $word = $matchedWord ?? $chars[$i];

                $tokens[] = [
                    'type' => 'word',
                    'text' => $word,
                    'pinyin' => $this->pinyinFor($word),
                    'translation' => self::$index[$word] ?? null,
                ];

                $i += $matchedLen;
            } else {
                $start = $i;
                while ($i < $count && ! preg_match('/[\p{Han}]/u', $chars[$i])) {
                    $i++;
                }

                $tokens[] = [
                    'type' => 'text',
                    'text' => implode('', array_slice($chars, $start, $i - $start)),
                ];
            }
        }

        return $tokens;
    }

    protected function loadIndex(): void
    {
        if (self::$index !== null) {
            return;
        }

        $cacheFile = storage_path('dict/cedict_index.php');

        if (file_exists($cacheFile)) {
            self::$index = require $cacheFile;

            return;
        }

        self::$index = $this->buildIndex();
        file_put_contents($cacheFile, '<?php return '.var_export(self::$index, true).';');
    }

    protected function buildIndex(): array
    {
        $sourceFile = storage_path('dict/cedict_ts.u8');
        $index = [];

        $handle = fopen($sourceFile, 'r');

        while (($line = fgets($handle)) !== false) {
            if ($line === '' || $line[0] === '#') {
                continue;
            }

            if (! preg_match('/^\S+\s+(\S+)\s+\[[^\]]+\]\s+\/(.+)\/\s*$/u', $line, $m)) {
                continue;
            }

            $simplified = $m[1];

            if (isset($index[$simplified])) {
                continue;
            }

            $definitions = array_values(array_filter(explode('/', $m[2])));
            $index[$simplified] = trim($definitions[0] ?? '');
        }

        fclose($handle);

        return $index;
    }
}
