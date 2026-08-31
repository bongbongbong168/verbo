<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\Flashcard;
use App\Models\Podcast;
use App\Models\Scan;
use App\Models\StudyUnit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The Vocabulary Bank.
 *
 * Every module saves words through `store`, and everything else here reads that
 * one table back in the shapes the bank needs: filtered by where a word came
 * from, searched, counted, and reviewed.
 */
class FlashcardController extends Controller
{
    /**
     * What a word may be attached to, keyed by the short name the client sends.
     *
     * A whitelist rather than a free-form morph map — the type arrives on the
     * request, so without it a caller could point a card at any model in the
     * app and have the bank render it. Same rule as RecentViewController.
     */
    private const SOURCES = [
        'article' => Article::class,
        'podcast' => Podcast::class,
        'study_unit' => StudyUnit::class,
        'scan' => Scan::class,
    ];

    /** The named slices the Review launcher and the filter strip offer. */
    private const BUCKETS = ['all', 'learning', 'mastered', 'difficult', 'today'];

    /**
     * Paginated because this is the one table that grows without bound —
     * every module auto-saves words here, so a committed learner accumulates
     * thousands. Returns Laravel's paginator shape: {data, current_page,
     * last_page, total, ...}. The frontend appends pages via "Load more".
     */
    public function index(Request $request)
    {
        $request->validate([
            'source' => ['nullable', Rule::in(array_keys(Flashcard::MODULES))],
            'bucket' => ['nullable', Rule::in(self::BUCKETS)],
            'q' => ['nullable', 'string', 'max:120'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $query = $this->filtered($request);

        // orderByDesc('id') is the tiebreaker, not decoration: cards saved in
        // the same second share a created_at, and a sort with ties has no
        // stable order across pages — rows can repeat or be skipped. SQLite
        // happens to be consistent here; Postgres guarantees nothing.
        $page = $query->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate((int) $request->query('limit', 50));

        $this->attachSources($page->getCollection());

        return $page;
    }

    /**
     * The four counters above the list.
     *
     * Every one is a real query. "Sources" is the number of DISTINCT places the
     * user has taken words from — the reference design called this slot
     * "Categories", but flashcards have no categories and inventing some would
     * be a number that means nothing.
     */
    public function stats(Request $request)
    {
        $base = $request->user()->flashcards();

        $total = (clone $base)->count();
        $mastered = (clone $base)->where('correct_streak', '>=', Flashcard::MASTERED_STREAK)->count();

        return response()->json([
            'words' => $total,
            // Everything not yet mastered is still being learned, which keeps
            // the two numbers summing to the total — two counters that do not
            // add up read as a bug even when both are right.
            'learning' => $total - $mastered,
            'mastered' => $mastered,
            'sources' => (clone $base)->distinct()->count('source_module'),
            'today' => (clone $base)->whereDate('created_at', now()->toDateString())->count(),
            'difficult' => (clone $base)
                ->where('lapses', '>', 0)
                ->where('correct_streak', '<', Flashcard::MASTERED_STREAK)
                ->count(),
            // Per-source counts so the filter pills can carry a number without
            // a request each.
            'by_source' => (clone $base)
                ->selectRaw('source_module, COUNT(*) as total')
                ->groupBy('source_module')
                ->pluck('total', 'source_module'),
            'mastered_streak' => Flashcard::MASTERED_STREAK,
        ]);
    }

    /**
     * A review run: the cards themselves, not a schedule.
     *
     * Shuffled in PHP after an ordered fetch rather than `inRandomOrder()`, so
     * the same bucket does not have to be re-sorted by the database on every
     * run and the newest words are the ones that make the cut when a bucket is
     * bigger than the run.
     */
    public function review(Request $request)
    {
        $request->validate([
            'source' => ['nullable', Rule::in(array_keys(Flashcard::MODULES))],
            'bucket' => ['nullable', Rule::in(self::BUCKETS)],
            'limit' => ['nullable', 'integer', 'min:1', 'max:60'],
        ]);

        $limit = (int) $request->query('limit', 20);

        $cards = $this->filtered($request)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        $this->attachSources($cards);

        return response()->json($cards->shuffle()->values());
    }

    /**
     * Record one answer.
     *
     * The streak resets to zero on a wrong answer and `lapses` only ever goes
     * up — that asymmetry is the whole point. Mastery has to be re-earned,
     * while "this one is difficult" is a fact about your history with the word
     * and must not be erased by a single lucky answer.
     */
    public function grade(Request $request, Flashcard $flashcard)
    {
        if ((int) $flashcard->user_id !== $request->user()->id) {
            abort(403);
        }

        $data = $request->validate([
            'correct' => ['required', 'boolean'],
        ]);

        $flashcard->review_count++;
        $flashcard->last_reviewed_at = now();

        if ($data['correct']) {
            $flashcard->correct_streak++;
        } else {
            $flashcard->correct_streak = 0;
            $flashcard->lapses++;
        }

        $flashcard->save();

        return response()->json($flashcard);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'word' => ['required', 'string', 'max:255'],
            'pinyin' => ['nullable', 'string', 'max:255'],
            'translation' => ['nullable', 'string', 'max:255'],
            'source_module' => ['nullable', 'string', 'max:255'],
            'source_type' => ['nullable', Rule::in(array_keys(self::SOURCES))],
            'source_id' => ['nullable', 'integer'],
            'example' => ['nullable', 'string', 'max:2000'],
        ]);

        $data['source_module'] = $data['source_module'] ?? 'manual';

        // The short key becomes the class, exactly as `recent_views` stores it.
        // Both halves must be present or neither is — half a reference points
        // at nothing and would just be skipped forever on read.
        if (! empty($data['source_type']) && ! empty($data['source_id'])) {
            $data['source_type'] = self::SOURCES[$data['source_type']];
        } else {
            unset($data['source_type'], $data['source_id']);
        }

        // The same word reached from two modules is still one card. Every save
        // path (Alt+1 on Read/Podcast/Scan, "Save all", the manual form) hits
        // this endpoint, so without the check a word saved twice silently
        // becomes two rows in the bank.
        $existing = $request->user()->flashcards()->where('word', $data['word'])->first();

        if ($existing) {
            // Backfill anything the earlier save was missing — a hover-save
            // carries pinyin and translation that a manual add may not have —
            // but keep the original source_module and source, which record
            // where the word was FIRST met. Meeting it again does not change
            // where you learned it.
            $backfill = array_filter([
                'pinyin' => $data['pinyin'] ?? null,
                'translation' => $data['translation'] ?? null,
                'example' => $existing->example ? null : ($data['example'] ?? null),
            ]);

            if (! $existing->source_type && isset($data['source_type'])) {
                $backfill['source_type'] = $data['source_type'];
                $backfill['source_id'] = $data['source_id'];
            }

            $existing->fill($backfill)->save();

            // 200, not 201: nothing was created.
            return response()->json($this->attachSources(collect([$existing]))->first(), 200);
        }

        $flashcard = $request->user()->flashcards()->create($data);

        return response()->json($this->attachSources(collect([$flashcard]))->first(), 201);
    }

    public function destroy(Request $request, Flashcard $flashcard)
    {
        if ((int) $flashcard->user_id !== $request->user()->id) {
            abort(403);
        }

        $flashcard->delete();

        return response()->json(['message' => 'Deleted']);
    }

    /**
     * The user's cards narrowed by the search box, the pills and the bucket.
     *
     * Returns the HasMany rather than a Builder — `$user->flashcards()` is the
     * relation, and every `where()` on it returns the relation too, so the
     * user scope can never be lost off the end of a chain.
     */
    private function filtered(Request $request): HasMany
    {
        $query = $request->user()->flashcards();

        if ($source = $request->query('source')) {
            $query->where('source_module', $source);
        }

        switch ($request->query('bucket')) {
            case 'learning':
                $query->where('correct_streak', '<', Flashcard::MASTERED_STREAK);
                break;
            case 'mastered':
                $query->where('correct_streak', '>=', Flashcard::MASTERED_STREAK);
                break;
            case 'difficult':
                $query->where('lapses', '>', 0)
                    ->where('correct_streak', '<', Flashcard::MASTERED_STREAK);
                break;
            case 'today':
                $query->whereDate('created_at', now()->toDateString());
                break;
        }

        if ($q = trim((string) $request->query('q'))) {
            // The example sentence is searched too — "which word was in that
            // line about the airport?" is exactly how someone looks for a word
            // whose characters they cannot remember.
            $like = '%' . $q . '%';
            $query->where(function (Builder $sub) use ($like) {
                $sub->where('word', 'like', $like)
                    ->orWhere('pinyin', 'like', $like)
                    ->orWhere('translation', 'like', $like)
                    ->orWhere('example', 'like', $like);
            });
        }

        return $query;
    }

    /**
     * Resolve every card's source in ONE query per type rather than one per
     * card. A page of 50 words from four kinds of place costs four queries.
     *
     * A card whose source has since been deleted keeps its module label and
     * loses only the link — the word is still yours, and blanking it because
     * an admin removed an article would be worse than saying a little less.
     */
    private function attachSources($cards)
    {
        $byType = $cards->filter->source_type->groupBy('source_type');

        $loaded = [];

        foreach ($byType as $class => $rows) {
            $ids = $rows->pluck('source_id')->unique()->all();

            $query = $class::whereIn('id', $ids);
            if ($class === StudyUnit::class) {
                $query->with('level');
            }

            $loaded[$class] = $query->get()->keyBy('id');
        }

        foreach ($cards as $card) {
            $card->setAttribute('source', $this->shapeSource($card, $loaded));
        }

        return $cards;
    }

    /** `{kind, label, title, link}`, or null when there is nothing to point at. */
    private function shapeSource(Flashcard $card, array $loaded): ?array
    {
        if (! $card->source_type) {
            return null;
        }

        $model = $loaded[$card->source_type][$card->source_id] ?? null;

        if (! $model) {
            return null;
        }

        $kind = array_search($card->source_type, self::SOURCES, true);

        if ($model instanceof StudyUnit) {
            return [
                'kind' => $kind,
                'label' => 'Module',
                // Level first, then the unit — "HSK 4 · Unit 3" is how a
                // learner refers to where they were.
                'title' => trim(($model->level->title ?? '') . ' · ' . ($model->lesson_label ?: $model->title)),
                'link' => '/study/units/' . $model->id,
            ];
        }

        if ($model instanceof Podcast) {
            return ['kind' => $kind, 'label' => 'Podcast', 'title' => $model->title, 'link' => '/podcast/' . $model->id];
        }

        if ($model instanceof Article) {
            return ['kind' => $kind, 'label' => 'Article', 'title' => $model->title, 'link' => '/read/' . $model->id];
        }

        return [
            'kind' => $kind,
            'label' => 'Scanned',
            // A scan has no title, so the filename is the only handle on it —
            // and an upload with no name still has to say something.
            'title' => $model->original_filename ?: 'Scanned text',
            'link' => '/scan/' . $model->id,
        ];
    }
}
