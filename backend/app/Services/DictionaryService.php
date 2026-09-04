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

    protected static array $termPinyinCache = [];

    public function pinyinFor(string $word): string
    {
        return self::$pinyinCache[$word] ??= Pinyin::sentence($word)->join(' ');
    }

    /**
     * Reading for a single vocabulary item, with the syllables run together
     * ("nóngjiālè") the way a dictionary headword is written. pinyinFor()
     * spaces every syllable, which is right for a sentence and wrong for one
     * word.
     */
    public function pinyinForTerm(string $term): string
    {
        return self::$termPinyinCache[$term] ??= Pinyin::sentence($term)->join('');
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

    /**
     * Senses that describe the ENTRY rather than the meaning.
     *
     * CEDICT lists a headword once per sense-group, and for a great many
     * single characters the surname or the dynasty comes FIRST — 机 opens with
     * "surname Ji", 明 with "Ming Dynasty", 时 with "old variant of 時". Taking
     * the first line therefore taught the wrong meaning for exactly the words
     * a learner is most likely to look up one character at a time.
     *
     * These are skipped only while a better sense remains; a character whose
     * every sense looks like this still gets one, because a surname is better
     * than nothing.
     */
    private const WEAK_SENSE = [
        '/^surname\s/i',
        '/^(old\s+)?variant of/i',
        /* A CROSS-REFERENCE, which in CEDICT is always "see" followed by
           Chinese: "see 會同縣|会同县[...]". The \p{Han} is load-bearing — a
           bare /^see/ also matches "see you tomorrow", and 明天见 duly lost its
           meaning to the joke sense that follows it. */
        '/^see\s+\p{Han}/u',
        '/^abbr\. for/i',
        '/^used in/i',
        '/Dynasty/i',
        // "Robam (brand)" beat "boss" for 老板 — a brand is never the sense a
        // learner is after.
        '/\(brand\)/i',
        // Proper nouns carrying a date: "Ming (c. 2000 BC), fourth of the
        // legendary Flame Emperors". Without this the emperor displaced
        // "bright" for 明, which is worse than the dynasty it replaced.
        '/\d{3,4}\s*(BC|AD|–|—)/u',
        '/legendary/i',
        '/^name of /i',
    ];

    /**
     * Register and grammar labels CEDICT prefixes to a sense. They describe
     * how a word is USED, not what it means, and every sense of 机's real
     * entry carries one — treating those as weak senses left the character on
     * "surname Ji". Stripped, "(bound form) machine; mechanism" becomes the
     * answer a learner wants.
     *
     * A KNOWN LIST, not "any leading bracket". Stripping every parenthetical
     * also ate the meaning-bearing ones — "(business) card" became "card" and
     * "(cooked) rice" became "rice", which is a quiet downgrade of a gloss
     * that was already right.
     */
    private const ANNOTATIONS = '(?:bound form|literary|coll\.|colloquial|slang|dialect|onom\.|archaic|old|Tw|PRC|fig\.|idiom|usu\.|often|also|esp\.)';

    private function stripAnnotations(string $sense): string
    {
        return trim(preg_replace(
            '/^(\(\s*'.self::ANNOTATIONS.'[^)]*\)\s*,?\s*)+/iu',
            '',
            $sense
        ));
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
            $definitions = array_values(array_filter(array_map('trim', explode('/', $m[2]))));

            if ($definitions === []) {
                continue;
            }

            $best = $this->bestSense($definitions);

            /* A headword appears on several lines. Previously the first line
               won outright; now a STRONG sense can displace a weak one that
               got there first, which is what moves 机 off "surname Ji". Two
               strong senses still resolve to the earlier line — CEDICT orders
               those by frequency, so first is the right answer. */
            if (! isset($index[$simplified])) {
                $index[$simplified] = $best;

                continue;
            }

            if ($this->isWeakSense($index[$simplified]) && ! $this->isWeakSense($best)) {
                $index[$simplified] = $best;
            }
        }

        fclose($handle);

        return $index;
    }

    /** The first sense that actually describes a meaning, else the first. */
    private function bestSense(array $definitions): string
    {
        foreach ($definitions as $sense) {
            $clean = $this->stripAnnotations($sense);
            if ($clean !== '' && ! $this->isWeakSense($clean)) {
                return $clean;
            }
        }

        return $this->stripAnnotations($definitions[0]) ?: $definitions[0];
    }

    private function isWeakSense(string $sense): bool
    {
        foreach (self::WEAK_SENSE as $pattern) {
            if (preg_match($pattern, $sense)) {
                return true;
            }
        }

        return false;
    }
}
