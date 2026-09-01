<?php

namespace App\Services;

use App\Models\Article;
use App\Models\Podcast;
use App\Models\Scan;
use App\Models\StudyTextLine;
use Illuminate\Support\Collection;

/**
 * Sentences showing a word in use, found in the learner's OWN library.
 *
 * Deliberately not a dictionary lookup and not an external corpus. CC-CEDICT
 * carries definitions, not examples, and a service like Tatoeba would be a
 * network dependency returning sentences from nowhere the learner has ever
 * been. Everything here comes from an article, a podcast transcript, a study
 * conversation or a scan already in this app — so every example is something
 * they can open and read in full, and the words around it are words this app
 * has already decided are at their level.
 *
 * The honest limit: a word saved from somewhere with little text around it may
 * genuinely have no examples, and the page says so rather than inventing one.
 */
class ExampleFinder
{
    /**
     * Sentence terminators. Chinese punctuation first, then the ASCII ones a
     * mixed-language passage uses. A newline ends a sentence too — a line in a
     * conversation is a complete utterance whether or not it is punctuated.
     */
    private const BREAKS = [
        /* Closing-quote pairs FIRST. PCRE tries lookbehind alternatives in
           order, so splitting on the bare 。of 时间？” would strand the ” at the
           head of the next sentence — which is exactly how an example came back
           reading 走路要多长时间？ with a quote mark left dangling. */
        '。”', '！”', '？”', '。"', '！"', '？"',
        '。', '！', '？', '；', '…', '!', '?', ';', "\n",
    ];

    /**
     * Long enough to teach something, short enough to read at a glance. A
     * 400-character run is a paragraph the splitter failed on, not a sentence.
     */
    private const MIN_CHARS = 2;

    private const MAX_CHARS = 400;

    public function __construct(private DictionaryService $dictionary)
    {
    }

    /**
     * @return array<int, array{text: string, pinyin: string, english: ?string, source: array}>
     */
    public function find(string $word, ?int $userId, int $limit = 3): array
    {
        if ($word === '') {
            return [];
        }

        $found = collect()
            /* Study lines first. They are authored as teaching material, they
               arrive with a human translation already attached, and they are
               the shortest — a line of dialogue written to demonstrate the
               language is a better example than a paragraph that happens to
               contain the word. */
            ->concat($this->fromStudyLines($word, $limit))
            ->concat($this->fromArticles($word, $limit))
            ->concat($this->fromPodcasts($word, $limit))
            ->concat($this->fromScans($word, $userId, $limit));

        return $this->dedupe($found)
            ->take($limit)
            ->map(function (array $row) {
                /* Generated only for the handful actually returned — the pinyin
                   pass walks the segmenter across the whole sentence, and doing
                   it for every candidate would be most of the work thrown
                   away. */
                $row['pinyin'] = $this->dictionary->pinyinFor($row['text']);

                return $row;
            })
            ->values()
            ->all();
    }

    private function fromStudyLines(string $word, int $limit): Collection
    {
        return StudyTextLine::query()
            ->where('chinese', 'like', '%'.$word.'%')
            ->with('text.unit.level')
            ->limit($limit * 3)
            ->get()
            ->map(function (StudyTextLine $line) {
                $unit = $line->text->unit ?? null;

                return [
                    'text' => trim((string) $line->chinese),
                    /* The one source that ships a human translation. The others
                       return null rather than machine-translating, which this
                       app does not do anywhere else either. */
                    'english' => $line->english,
                    'source' => [
                        'label' => 'Lesson',
                        'title' => $unit
                            ? trim(($unit->level->title ?? '').' · '.($unit->lesson_label ?: $unit->title))
                            : 'Study',
                        'link' => $unit ? '/study/units/'.$unit->id : null,
                    ],
                ];
            });
    }

    private function fromArticles(string $word, int $limit): Collection
    {
        return Article::query()
            ->where('body', 'like', '%'.$word.'%')
            ->limit($limit * 2)
            ->get(['id', 'title', 'body'])
            ->flatMap(fn (Article $a) => $this->sentencesIn($a->body, $word, [
                'label' => 'Article',
                'title' => $a->title,
                'link' => '/read/'.$a->id,
            ]));
    }

    private function fromPodcasts(string $word, int $limit): Collection
    {
        return Podcast::query()
            ->whereNotNull('transcript')
            ->where('transcript', 'like', '%'.$word.'%')
            ->limit($limit * 2)
            ->get(['id', 'title', 'transcript'])
            ->flatMap(fn (Podcast $p) => $this->sentencesIn($p->transcript, $word, [
                'label' => 'Podcast',
                'title' => $p->title,
                'link' => '/podcast/'.$p->id,
            ]));
    }

    /**
     * Scans are scoped to the OWNER, unlike the other three.
     *
     * An article, a podcast and a study unit are published material any account
     * can already open, so quoting them back shows the learner something they
     * have access to. A scan is a private upload — someone else's photographed
     * page must never surface as an example sentence in this learner's bank.
     */
    private function fromScans(string $word, ?int $userId, int $limit): Collection
    {
        if (! $userId) {
            return collect();
        }

        return Scan::query()
            ->where('user_id', $userId)
            ->whereNotNull('raw_text')
            ->where('raw_text', 'like', '%'.$word.'%')
            ->limit($limit * 2)
            ->get(['id', 'original_filename', 'raw_text'])
            ->flatMap(fn (Scan $s) => $this->sentencesIn($s->raw_text, $word, [
                'label' => 'Scanned',
                'title' => $s->original_filename ?: 'Scanned text',
                'link' => '/scan/'.$s->id,
            ]));
    }

    /** Split a passage and keep only the sentences containing the word. */
    private function sentencesIn(?string $body, string $word, array $source): Collection
    {
        if (! $body) {
            return collect();
        }

        /* Split AFTER the terminator (a lookbehind) rather than on it, so the
           punctuation stays on the sentence it ends — a line stripped of its 。
           reads as a fragment. */
        /* ...and NOT when a closing quote follows. The two-character branches
           above let the split happen after the quote instead; without this
           negative lookahead both positions match, so 走路要多长时间？” split
           twice and shipped the sentence stripped of its own closing quote. */
        $pattern = '/(?<='.implode('|', array_map(
            fn ($b) => preg_quote($b, '/'),
            self::BREAKS
        )).')(?![”"』」）)\]])/u';

        return collect(preg_split($pattern, $body) ?: [])
            ->map(fn ($s) => trim((string) $s))
            ->filter(function (string $s) use ($word) {
                $len = mb_strlen($s);

                return $len >= self::MIN_CHARS
                    && $len <= self::MAX_CHARS
                    && mb_strpos($s, $word) !== false;
            })
            ->map(fn (string $s) => [
                'text' => $this->balanceQuotes($s),
                'english' => null,
                'source' => $source,
            ]);
    }

    /**
     * Drop a quote mark whose partner is in a different sentence.
     *
     * A passage quotes across several sentences, so pulling one out of the
     * middle can take a closing ” whose opening “ stayed behind — which reads
     * as a typo in an example the learner is meant to trust. Only ever removes
     * an UNMATCHED mark: a sentence carrying both keeps them.
     */
    private function balanceQuotes(string $s): string
    {
        if (mb_substr($s, -1) === '”' && mb_strpos($s, '“') === false) {
            $s = rtrim(mb_substr($s, 0, -1));
        }

        if (mb_substr($s, 0, 1) === '“' && mb_strpos($s, '”') === false) {
            $s = ltrim(mb_substr($s, 1));
        }

        return $s;
    }

    /**
     * Never the same sentence twice, shortest first.
     *
     * The same line genuinely appears in more than one place — a phrase drilled
     * in a lesson also turns up in an article — and three identical examples
     * teach nothing. Shorter wins, because a short sentence shows the word's
     * shape more clearly than a long one that merely contains it.
     */
    private function dedupe(Collection $rows): Collection
    {
        $perSource = [];

        return $rows
            ->sortBy(fn (array $r) => mb_strlen($r['text']))
            ->unique(fn (array $r) => $r['text'])
            /* At most two from any one place. Sorting purely by length let a
               single chatty lesson supply all three, which shows the word in
               one register and one context — the point of three examples is
               that they differ. A second pass over the same source is fine; a
               third is a list, not a spread. */
            ->filter(function (array $r) use (&$perSource) {
                $key = $r['source']['label'].'|'.$r['source']['title'];
                $perSource[$key] = ($perSource[$key] ?? 0) + 1;

                return $perSource[$key] <= 2;
            });
    }
}
