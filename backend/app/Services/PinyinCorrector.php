<?php

namespace App\Services;

/**
 * Checks the pinyin the model wrote against the app's own dictionary, and
 * replaces it where the two disagree.
 *
 * WHY THIS EXISTS: a language model gets tone marks wrong occasionally, and
 * intermittently wrong is the worst kind — a learner cannot tell which lines
 * to trust, so every line becomes untrustworthy. Verbo does not have to guess:
 * `DictionaryService` already derives tone-marked pinyin from CC-CEDICT plus
 * overtrue/pinyin, deterministically, and that is what the rest of the app
 * renders over Read, Podcast and Study. The assistant now answers from the
 * same source as everything else.
 *
 * IT CORRECTS TONES, NOT STYLE. The dictionary spaces every syllable
 * (`nǐ jīn tiān`) while the model groups them into words (`Nǐ jīntiān`), and
 * the model's grouping is the nicer one to read. So the comparison strips
 * spacing, case and punctuation first: if only the grouping differs, the
 * model's line is kept exactly as written. A line is only replaced when the
 * actual syllables or tone marks are wrong, which is the thing that misleads.
 */
class PinyinCorrector
{
    public function __construct(private DictionaryService $dictionary)
    {
    }

    /** Any Han character. */
    private const HAN = '\x{4e00}-\x{9fff}\x{3400}-\x{4dbf}';

    /**
     * Walk the reply and fix any pinyin line that follows a Chinese line.
     *
     * Deliberately conservative: it only looks at the line DIRECTLY after a
     * Chinese one, and only replaces when it already looks like pinyin. A
     * translation, a blank line or an explanation is left alone, so a reply
     * this does not understand comes through untouched rather than mangled.
     */
    public function fix(string $reply): string
    {
        $lines = preg_split('/\R/u', $reply);

        /*
         * Indexed, NOT `foreach ($lines as $i => $line)`.
         *
         * This pass writes to `$lines[$i + 1]`, and foreach walks a COPY taken
         * before the loop began — so on reaching that next line it handed back
         * the stale original and wrote it straight over the correction. Every
         * fix was made and then immediately undone one iteration later.
         */
        foreach (array_keys($lines) as $i) {
            $line = $lines[$i];
            // The model uses BOTH shapes, so both are checked. This one puts
            // the pinyin in brackets on the same line — `你好 (nǐ hǎo) - Hello`
            // — and it was the shape that actually appeared in the report.
            $lines[$i] = $line = $this->fixInline($line);

            $chinese = $this->chineseIn($line);
            if ($chinese === '' || !isset($lines[$i + 1])) {
                continue;
            }

            $next = $lines[$i + 1];
            $expected = trim($this->dictionary->pinyinFor($chinese));

            if ($expected === '' || !$this->isPinyinFor($next, $expected)) {
                continue;
            }

            // Keep any "Pinyin:" label the model wrote, and its punctuation.
            preg_match('/^\s*([A-Za-z]+\s*[:：]\s*)?(.*?)\s*$/u', $next, $m);
            $label = $m[1] ?? '';
            $written = $m[2] ?? '';

            if ($this->same($written, $expected)) {
                continue; // only the word grouping differs — the model's reads better
            }

            $lines[$i + 1] = $label.$this->matchTrailingPunctuation($expected, $written);
        }

        return implode("\n", $lines);
    }

    /**
     * `汉字（pinyin）` on one line — the bracketed form.
     *
     * Only the Chinese IMMEDIATELY before the bracket is used, so a sentence
     * mentioning several words does not have them all swept into one lookup.
     * Both ASCII and full-width brackets, because the model writes either.
     */
    private function fixInline(string $line): string
    {
        /* The gap before the bracket may carry punctuation as well as spaces —
           `你好！(nǐ hǎo)` is the common shape, and requiring whitespace alone
           missed every sentence that ended in a full-width ！ or ？. */
        return preg_replace_callback(
            '/(['.self::HAN.']+)([^\S\r\n]*[！？。，、；：!?.,;:]*[^\S\r\n]*)([(（])([^)）]+)([)）])/u',
            function ($m) {
                $expected = trim($this->dictionary->pinyinFor($m[1]));

                if ($expected === '' || !$this->isPinyinFor($m[4], $expected)) {
                    return $m[0]; // not pinyin in there — a gloss, a note, leave it
                }

                if ($this->same($m[4], $expected)) {
                    return $m[0]; // only the word grouping differs
                }

                return $m[1].$m[2].$m[3].$this->matchTrailingPunctuation($expected, $m[4]).$m[5];
            },
            $line
        ) ?? $line;
    }

    /** The Han characters in a line, with everything else dropped. */
    private function chineseIn(string $line): string
    {
        preg_match_all('/['.self::HAN.']+/u', $line, $m);

        return implode('', $m[0] ?? []);
    }

    /**
     * Is this line the pinyin for that Chinese — right or wrong?
     *
     * Decided against the EXPECTED pinyin rather than by the look of the line
     * on its own, and that is what makes toneless pinyin fixable. An earlier
     * version required a tone mark to recognise pinyin at all, so `Ni hao`
     * — pinyin with the tones simply missing, one of the errors worth
     * catching — was passed over as if it were English.
     *
     * Stripping the tones off both sides answers it exactly: `Ni hao` bares
     * to `nihao` and so does `nǐ hǎo`, so it is the pinyin and needs its tones
     * put back. `Hello there!` bares to `hellothere`, matches nothing, and is
     * left alone — which is the case that must never go wrong.
     */
    private function isPinyinFor(string $line, string $expected): bool
    {
        if (trim($line) === '' || preg_match('/['.self::HAN.']/u', $line)) {
            return false;
        }

        return $this->toneless($line) === $this->toneless($expected);
    }

    /** Letters only, lowercased, with every tone mark removed. */
    private function toneless(string $s): string
    {
        $marks = ['āáǎà' => 'a', 'ēéěè' => 'e', 'īíǐì' => 'i', 'ōóǒò' => 'o', 'ūúǔù' => 'u', 'ǖǘǚǜü' => 'v'];
        $s = mb_strtolower($s, 'UTF-8');

        foreach ($marks as $from => $to) {
            $s = preg_replace('/['.$from.']/u', $to, $s);
        }

        // `nǚ` and `nv` are the same syllable written two ways.
        return preg_replace('/[^a-z]+/', '', str_replace('v', 'u', $s)) ?? '';
    }

    /** Same syllables and tones, ignoring spacing, case and punctuation. */
    private function same(string $a, string $b): bool
    {
        return $this->bare($a) === $this->bare($b);
    }

    private function bare(string $s): string
    {
        $s = mb_strtolower($s, 'UTF-8');

        return preg_replace('/[^\p{L}\p{M}]+/u', '', $s) ?? '';
    }

    /** Carry over the question mark or full stop the model ended on. */
    private function matchTrailingPunctuation(string $corrected, string $original): string
    {
        if (preg_match('/([?!.。！？]+)\s*$/u', $original, $m)) {
            return $corrected.$m[1];
        }

        return $corrected;
    }
}
