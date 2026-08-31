<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\ArticleBookmark;
use App\Models\ArticleLike;
use App\Models\ArticleShare;
use App\Models\ArticleView;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;

class ArticleInteractionController extends Controller
{
    /**
     * Like / unlike. One endpoint, because the button is a toggle — two
     * endpoints would let the client's idea of the current state disagree with
     * the database's.
     */
    public function toggleLike(Request $request, Article $article)
    {
        $user = $request->user();
        $existing = ArticleLike::where('user_id', $user->id)
            ->where('article_id', $article->id)
            ->first();

        if ($existing) {
            $existing->delete();

            return response()->json($this->state($article, $user->id));
        }

        try {
            ArticleLike::create(['user_id' => $user->id, 'article_id' => $article->id]);
        } catch (QueryException $e) {
            // The unique index is the real guard; a double-tap racing itself
            // lands here and is simply already liked.
        }

        return response()->json($this->state($article, $user->id));
    }

    /** Save / unsave. Same toggle shape as likes. */
    public function toggleBookmark(Request $request, Article $article)
    {
        $user = $request->user();
        $existing = ArticleBookmark::where('user_id', $user->id)
            ->where('article_id', $article->id)
            ->first();

        if ($existing) {
            $existing->delete();

            return response()->json($this->state($article, $user->id));
        }

        try {
            ArticleBookmark::create(['user_id' => $user->id, 'article_id' => $article->id]);
        } catch (QueryException $e) {
            // Already saved.
        }

        return response()->json($this->state($article, $user->id));
    }

    /**
     * "My Saved Articles".
     *
     * Ordered by when it was SAVED, not when the article was written — the
     * list is a record of what you put aside, so the thing you saved last
     * belongs at the top.
     */
    public function bookmarks(Request $request)
    {
        $rows = ArticleBookmark::where('user_id', $request->user()->id)
            ->with('article')
            ->latest('created_at')
            ->latest('id')
            ->get()
            // An article deleted after being saved leaves a dangling row;
            // drop it rather than rendering an empty card.
            ->filter(fn (ArticleBookmark $b) => $b->article !== null)
            ->map(function (ArticleBookmark $b) {
                $a = $b->article;
                // Bodies are large and the card only needs a preview.
                $excerpt = mb_substr((string) $a->body, 0, 120);
                $a = $a->toArray();
                unset($a['body'], $a['body_en']);
                $a['excerpt'] = $excerpt;
                $a['saved_at'] = $b->created_at;

                return $a;
            })
            ->values();

        return response()->json($rows);
    }

    /**
     * Record a share. Analytics only — deliberately NOT fed into the
     * recommendation score: sharing an article with a friend says nothing
     * about whether YOU want more like it.
     */
    public function share(Request $request, Article $article)
    {
        $data = $request->validate([
            'platform' => ['nullable', 'string', 'max:40'],
        ]);

        ArticleShare::create([
            'user_id' => $request->user()->id,
            'article_id' => $article->id,
            'platform' => $data['platform'] ?? null,
        ]);

        return response()->json(['message' => 'Recorded']);
    }

    /**
     * Record that the article was opened.
     *
     * One row per user per article with a counter, not an append-only log: the
     * recommender only asks "has this person read things like this", and a log
     * would grow without bound for an answer that never needs more than the
     * latest visit.
     */
    public function view(Request $request, Article $article)
    {
        $row = ArticleView::firstOrNew([
            'user_id' => $request->user()->id,
            'article_id' => $article->id,
        ]);

        $row->views = ($row->views ?? 0) + 1;
        $row->last_viewed_at = now();
        $row->save();

        return response()->json(['message' => 'Recorded']);
    }

    /**
     * The counts plus THIS viewer's own state, which is what the buttons
     * render from. Returned by every toggle so the client never has to guess
     * what the new state is.
     */
    public static function stateFor(Article $article, ?int $userId): array
    {
        return [
            'likes' => ArticleLike::where('article_id', $article->id)->count(),
            'liked' => $userId
                ? ArticleLike::where('article_id', $article->id)->where('user_id', $userId)->exists()
                : false,
            'bookmarked' => $userId
                ? ArticleBookmark::where('article_id', $article->id)->where('user_id', $userId)->exists()
                : false,
            'comments' => $article->allComments()->count(),
        ];
    }

    private function state(Article $article, ?int $userId): array
    {
        return self::stateFor($article, $userId);
    }
}
