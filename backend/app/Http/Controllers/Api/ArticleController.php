<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Services\DictionaryService;
use App\Services\RecommendationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ArticleController extends Controller
{
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
                'image_path',
                'user_id',
                'created_at',
                DB::raw('SUBSTR(body, 1, 120) AS excerpt'),
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

    public function show(Request $request, Article $article, DictionaryService $dictionary)
    {
        $article->load('tags');

        return array_merge($article->toArray(), [
            'tokens' => $dictionary->annotate($article->body),
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
                'tags' => $a->tags->map(fn ($t) => ['kind' => $t->kind, 'value' => $t->value]),
                'excerpt' => mb_substr((string) $a->body, 0, 120),
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
