<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Services\DictionaryService;
use App\Services\RecommendationService;
use App\Services\UsageAllowanceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

class ArticleController extends Controller
{
    /**
     * A weekly reading target.
     *
     * NOT read from `learning_preferences` — `daily_goal` there is a duration
     * ("30 minutes"), and converting minutes into a number of articles would be
     * a made-up exchange rate presented as the learner's own goal. This is an
     * app default instead, and the banner says so on screen rather than
     * implying the learner set it. Same footing as `Flashcard::MASTERED_STREAK`:
     * a stated rule that can be defended, not a felt one.
     */
    public const WEEKLY_READ_GOAL = 5;

    /**
     * Everything the Read page's banner needs, in ONE request.
     *
     * Four slides would otherwise be three or four calls on every visit to the
     * page, against a 300/min bucket that React StrictMode doubles in dev. It
     * also keeps the banner atomic: the slides describe one moment rather than
     * three fetches that landed at slightly different times.
     *
     * Declared BEFORE `/articles/{article}` — "highlights" would otherwise bind
     * as an id, the same trap `articles/recommended` sits next to.
     */
    public function highlights(Request $request, RecommendationService $recommender)
    {
        $user = $request->user();

        /* Two picks, so the "continue" slide has something to fall back to
           without a second scoring pass. */
        $scored = $recommender->forUser($user, 2);
        $recommended = $scored[0]['article'] ?? null;

        /* "Continue learning" is the last thing they actually opened, which is
           real resume state rather than a second recommendation wearing a
           different label. Articles have no notion of being finished, so this
           is deliberately "pick up where you left off", not "you are 60%
           through". Excludes whatever the slide above is already showing. */
        $lastRead = DB::table('article_views')
            ->where('user_id', $user->id)
            ->when($recommended, fn ($q) => $q->where('article_id', '!=', $recommended->id))
            ->orderByDesc('last_viewed_at')
            ->first();

        $continue = null;
        $continueKind = null;
        if ($lastRead) {
            $continue = Article::find($lastRead->article_id);
            $continueKind = 'resume';
        }
        if (! $continue) {
            // A learner who has read nothing has nothing to continue. Offer the
            // runner-up recommendation and let the client word it differently,
            // rather than showing an empty slide or repeating slide one.
            $continue = $scored[1]['article'] ?? null;
            $continueKind = $continue ? 'suggestion' : null;
        }

        $weekStart = now()->startOfWeek();

        return [
            'recommended' => $recommended ? array_merge($this->heroCard($recommended), [
                // The same self-explaining sentence the Read page already uses,
                // so the pick reads as reasoned rather than promoted.
                'why' => RecommendationService::explain($scored[0]['reasons']),
            ]) : null,
            'continue' => $continue ? array_merge($this->heroCard($continue), [
                'kind' => $continueKind,
                'last_read_at' => $lastRead->last_viewed_at ?? null,
            ]) : null,
            'week' => [
                // One row per (user, article), so this counts DISTINCT articles
                // opened this week — which is what "you've read 4" means.
                'articles_read' => DB::table('article_views')
                    ->where('user_id', $user->id)
                    ->where('last_viewed_at', '>=', $weekStart)
                    ->count(),
                'goal' => self::WEEKLY_READ_GOAL,
                'words_saved' => $user->flashcards()
                    ->where('created_at', '>=', $weekStart)
                    ->count(),
            ],
        ];
    }

    /** The fields a banner slide renders. Mirrors the list card's shape. */
    private function heroCard(Article $a): array
    {
        return [
            'id' => $a->id,
            'title' => $a->title,
            'type' => $a->type,
            'category' => $a->category,
            'hsk_level' => $a->hsk_level,
            'difficulty' => $a->difficulty,
            'image_url' => $a->image_url,
            'reading_minutes' => $a->reading_minutes,
            'is_premium' => $a->is_premium,
        ];
    }

    public function index(Request $request)
    {
        // The excerpt is trimmed in the database so full article bodies never
        // cross the wire just to render a two-line card preview. SUBSTR counts
        // characters (not bytes) on both SQLite and Postgres, so Chinese text
        // is cut safely. LENGTH(body) rides along so the card can show a
        // reading time without the body itself — see Article::reading_minutes.
        $articles = Article::query()
            /* select(), NOT get([...]) — passing columns to get() replaces the
               select list and drops withCount's subselects with it, which
               silently shipped every full body AND lost the excerpt the cards
               render from. Same trap StudyLevelController::index hit. */
            ->select([
                'id',
                'title',
                'type',
                'hsk_level',
                'difficulty',
                'category',
                'is_premium',
                'image_path',
                'user_id',
                'created_at',
                DB::raw("CASE WHEN is_premium THEN SUBSTR(body, 1, CASE WHEN LENGTH(body) * 0.30 < 120 THEN CAST(LENGTH(body) * 0.30 AS INTEGER) ELSE 120 END) ELSE SUBSTR(body, 1, 120) END AS excerpt"),
                DB::raw('LENGTH(body) AS body_length'),
            ])
            ->with('tags')
            ->withCount(['likes', 'allComments as comments_count'])
            ->latest()
            ->get();

        // Which of these the viewer has liked or saved, in two queries rather
        // than two per card.
        $userId = $request->user()?->id;
        $liked = $userId
            ? \App\Models\ArticleLike::where('user_id', $userId)->pluck('article_id')->flip()
            : collect();
        $saved = $userId
            ? \App\Models\ArticleBookmark::where('user_id', $userId)->pluck('article_id')->flip()
            : collect();

        return $articles->map(function (Article $a) use ($liked, $saved) {
            $row = $a->toArray();
            unset($row['body_length']);
            $row['liked'] = $liked->has($a->id);
            $row['bookmarked'] = $saved->has($a->id);

            return $row;
        });
    }

    public function show(Request $request, Article $article, DictionaryService $dictionary, UsageAllowanceService $allowances)
    {
        $article->load('tags');

        $locked = $article->is_premium
            && ! $request->user()->is_pro
            && ! $request->user()->is_admin;
        $body = $locked ? $this->premiumPreview($article->body) : $article->body;
        $payload = $article->toArray();
        $payload['body'] = $body;
        // A complete authored translation is content too. Do not ship it in a
        // response whose Chinese body has deliberately been truncated.
        $payload['body_en'] = $locked ? null : $article->body_en;
        $translationKey = 'article-translation:v1:'.$article->id.':'.hash('sha256', trim((string) $article->body));

        return array_merge($payload, [
            'tokens' => $dictionary->annotate($body),
            'premium_locked' => $locked,
            'preview_percentage' => $locked ? 30 : 100,
            'translation_cached' => Cache::has($translationKey),
            'translation_usage' => $allowances->summary($request->user(), UsageAllowanceService::TRANSLATIONS),
            // The counts and this viewer's own like/save state, so the buttons
            // render correctly on first paint rather than after a second call.
            'interactions' => ArticleInteractionController::stateFor($article, $request->user()?->id),
        ]);
    }

    /**
     * "Recommended for You" — rule-based scoring, see RecommendationService.
     *
     * `exclude` keeps the article you are currently reading out of its own
     * recommendation list.
     */
    public function recommended(Request $request, RecommendationService $recommender)
    {
        $limit = min(max((int) $request->query('limit', 3), 1), 12);
        $exclude = $request->filled('exclude') ? (int) $request->query('exclude') : null;

        $scored = $recommender->forUser($request->user(), $limit, $exclude);

        return response()->json(array_map(function (array $row) {
            $a = $row['article'];

            return [
                'id' => $a->id,
                'title' => $a->title,
                'type' => $a->type,
                'hsk_level' => $a->hsk_level,
                'category' => $a->category,
                'image_url' => $a->image_url,
                'reading_minutes' => $a->reading_minutes,
                'is_premium' => $a->is_premium,
                'tags' => $a->tags->map(fn ($t) => ['kind' => $t->kind, 'value' => $t->value]),
                'excerpt' => mb_substr(
                    $a->is_premium ? $this->premiumPreview((string) $a->body) : (string) $a->body,
                    0,
                    120
                ),
                'score' => $row['score'],
                'why' => RecommendationService::explain($row['reasons']),
                'already_read' => $row['already_read'],
            ];
        }, $scored));
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:article,story,funfact'],
            'body' => ['required', 'string'],
            'body_en' => ['nullable', 'string'],
            'image' => ['nullable', 'image', 'max:10240'],
            // All optional: the five articles that predate this stay valid.
            'hsk_level' => ['nullable', 'string', 'max:20'],
            'difficulty' => ['nullable', 'string', 'max:20'],
            'category' => ['nullable', 'string', 'max:60'],
            'is_premium' => ['sometimes', 'boolean'],
            'tags' => ['nullable', 'array'],
            'tags.*.kind' => ['required_with:tags', 'string', 'in:goal,focus,interest,style,topic'],
            'tags.*.value' => ['required_with:tags', 'string', 'max:60'],
        ]);

        if ($request->hasFile('image')) {
            $data['image_path'] = $request->file('image')->store('articles', 'public');
        }

        // Not a fillable column — the tags go to their own table below.
        $tags = $data['tags'] ?? null;
        unset($data['tags']);

        $article = $request->user()->articles()->create($data);
        $this->syncTags($article, $tags);

        return response()->json($article->load('tags'), 201);
    }

    public function update(Request $request, Article $article)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:article,story,funfact'],
            'body' => ['required', 'string'],
            'body_en' => ['nullable', 'string'],
            'image' => ['nullable', 'image', 'max:10240'],
            // All optional: the five articles that predate this stay valid.
            'hsk_level' => ['nullable', 'string', 'max:20'],
            'difficulty' => ['nullable', 'string', 'max:20'],
            'category' => ['nullable', 'string', 'max:60'],
            'is_premium' => ['sometimes', 'boolean'],
            'tags' => ['nullable', 'array'],
            'tags.*.kind' => ['required_with:tags', 'string', 'in:goal,focus,interest,style,topic'],
            'tags.*.value' => ['required_with:tags', 'string', 'max:60'],
        ]);

        if ($request->hasFile('image')) {
            if ($article->image_path) {
                Storage::disk('public')->delete($article->image_path);
            }
            $data['image_path'] = $request->file('image')->store('articles', 'public');
        }

        $tags = $data['tags'] ?? null;
        unset($data['tags']);

        $article->update($data);
        $this->syncTags($article, $tags);

        return response()->json($article->fresh()->load('tags'));
    }

    /**
     * Replace an article's tags wholesale.
     *
     * `null` means "the caller did not mention tags" and leaves them alone — an
     * edit form that does not render the tag field must not silently wipe them.
     * An empty array is an explicit "no tags" and does clear them.
     */
    private function syncTags(Article $article, ?array $tags): void
    {
        if ($tags === null) {
            return;
        }

        $article->tags()->delete();

        foreach ($tags as $tag) {
            $article->tags()->firstOrCreate([
                'kind' => $tag['kind'],
                'value' => trim($tag['value']),
            ]);
        }
    }

    /**
     * Return a useful opening without sending the paid part to the browser.
     * The cut prefers the last sentence boundary near 30%; when a first
     * sentence is unusually long it falls back to a character-safe cut.
     */
    private function premiumPreview(string $body): string
    {
        $body = trim($body);
        $length = mb_strlen($body);
        if ($length < 2) {
            return $body;
        }

        $target = max(1, min($length - 1, (int) floor($length * 0.30)));
        $candidate = mb_substr($body, 0, $target);
        $minimumBoundary = (int) floor($target * 0.55);
        $best = null;

        foreach (['。', '！', '？', '!', '?', "\n"] as $mark) {
            $position = mb_strrpos($candidate, $mark);
            if ($position !== false && $position >= $minimumBoundary) {
                $best = max($best ?? 0, $position + 1);
            }
        }

        return rtrim(mb_substr($candidate, 0, $best ?? $target));
    }

    public function destroy(Request $request, Article $article)
    {
        abort_unless($request->user()->is_admin, 403);

        if ($article->image_path) {
            Storage::disk('public')->delete($article->image_path);
        }

        $article->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
