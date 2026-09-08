<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\ArticleComment;
use Illuminate\Http\Request;
use App\Rules\NoUnsafeLinks;

class ArticleCommentController extends Controller
{
    /**
     * The article's comments, oldest first, each with its replies.
     *
     * Oldest-first because a comment thread reads as a conversation — newest
     * first would put replies above the thing they answer.
     */
    public function index(Request $request, Article $article)
    {
        $comments = $article->comments()
            ->with([
                'user:id,name,avatar_path',
                'replies.user:id,name,avatar_path',
            ])
            ->oldest('id')
            ->get()
            ->map(fn (ArticleComment $c) => $this->shape($c, $request->user()?->id));

        return response()->json($comments);
    }

    public function store(Request $request, Article $article)
    {
        $data = $request->validate([
            // Trimmed before validating, so a comment of only spaces is empty.
            // Links go through Safe Browsing: a comment is public to every
            // reader of the article, so one bad link reaches the widest
            // audience of anywhere in the app.
            'content' => ['required', 'string', 'max:2000', new NoUnsafeLinks],
            'parent_id' => ['nullable', 'integer'],
        ]);

        if (trim($data['content']) === '') {
            return response()->json(['message' => 'Write something first.'], 422);
        }

        $parentId = null;
        if (! empty($data['parent_id'])) {
            $parent = ArticleComment::where('id', $data['parent_id'])
                ->where('article_id', $article->id)
                ->first();

            if (! $parent) {
                return response()->json(['message' => 'That comment no longer exists.'], 422);
            }

            /* Replies stay ONE level deep. Replying to a reply attaches to its
               parent instead of nesting further — the thread stays readable and
               the UI never has to render an arbitrary tree. */
            $parentId = $parent->parent_id ?: $parent->id;
        }

        $comment = ArticleComment::create([
            'user_id' => $request->user()->id,
            'article_id' => $article->id,
            'parent_id' => $parentId,
            'content' => trim($data['content']),
        ]);

        $comment->load('user:id,name,avatar_path');

        return response()->json($this->shape($comment, $request->user()->id), 201);
    }

    /** Only the author may edit. */
    public function update(Request $request, ArticleComment $comment)
    {
        // Cast: SQLite returns foreign keys as strings, so a bare !== would
        // 403 the rightful author.
        abort_unless((int) $comment->user_id === $request->user()->id, 403);

        $data = $request->validate([
            'content' => ['required', 'string', 'max:2000'],
        ]);

        if (trim($data['content']) === '') {
            return response()->json(['message' => 'Write something first.'], 422);
        }

        $comment->update(['content' => trim($data['content'])]);
        $comment->load('user:id,name,avatar_path');

        return response()->json($this->shape($comment->fresh()->load('user:id,name,avatar_path'), $request->user()->id));
    }

    /**
     * The author may delete their own; an admin may delete any, which is the
     * only moderation path in the app.
     *
     * Deleting a top-level comment takes its replies with it — the migration's
     * cascade does that — because a reply with nothing to reply to is noise.
     */
    public function destroy(Request $request, ArticleComment $comment)
    {
        $user = $request->user();
        abort_unless((int) $comment->user_id === $user->id || $user->is_admin, 403);

        $comment->delete();

        return response()->noContent();
    }

    private function shape(ArticleComment $c, ?int $viewerId): array
    {
        return [
            'id' => $c->id,
            'content' => $c->content,
            'created_at' => $c->created_at,
            'edited' => $c->edited,
            'user' => [
                'id' => $c->user?->id,
                'name' => $c->user?->name,
                'avatar_url' => $c->user?->avatar_url,
            ],
            // So the UI can show Edit/Delete without re-deriving ownership.
            'mine' => $viewerId !== null && (int) $c->user_id === $viewerId,
            'replies' => $c->relationLoaded('replies')
                ? $c->replies->map(fn (ArticleComment $r) => $this->shape($r, $viewerId))->values()
                : [],
        ];
    }
}
