<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Podcast;
use App\Models\PodcastComment;
use App\Rules\NoUnsafeLinks;
use Illuminate\Http\Request;

/**
 * Comments on a podcast episode. Deliberately the same contract as
 * ArticleCommentController, so the one comments component serves both pages:
 * oldest first, one level of replies, author edits, author or admin deletes,
 * and every link through Safe Browsing because a comment is public.
 */
class PodcastCommentController extends Controller
{
    public function index(Request $request, Podcast $podcast)
    {
        $comments = PodcastComment::where('podcast_id', $podcast->id)
            ->whereNull('parent_id')
            ->with(['user:id,name,avatar_path', 'replies.user:id,name,avatar_path'])
            ->oldest('id')
            ->get()
            ->map(fn (PodcastComment $c) => $this->shape($c, $request->user()?->id));

        return response()->json($comments);
    }

    public function store(Request $request, Podcast $podcast)
    {
        $data = $request->validate([
            'content' => ['required', 'string', 'max:2000', new NoUnsafeLinks],
            'parent_id' => ['nullable', 'integer'],
        ]);

        if (trim($data['content']) === '') {
            return response()->json(['message' => 'Write something first.'], 422);
        }

        $parentId = null;
        if (! empty($data['parent_id'])) {
            $parent = PodcastComment::where('id', $data['parent_id'])
                ->where('podcast_id', $podcast->id)
                ->first();

            if (! $parent) {
                return response()->json(['message' => 'That comment no longer exists.'], 422);
            }

            // One level deep: a reply to a reply attaches to its top-level parent.
            $parentId = $parent->parent_id ?: $parent->id;
        }

        $comment = PodcastComment::create([
            'user_id' => $request->user()->id,
            'podcast_id' => $podcast->id,
            'parent_id' => $parentId,
            'content' => trim($data['content']),
        ]);

        $comment->load('user:id,name,avatar_path');

        return response()->json($this->shape($comment, $request->user()->id), 201);
    }

    public function update(Request $request, PodcastComment $comment)
    {
        // Cast: SQLite returns foreign keys as strings.
        abort_unless((int) $comment->user_id === $request->user()->id, 403);

        $data = $request->validate([
            'content' => ['required', 'string', 'max:2000', new NoUnsafeLinks],
        ]);

        if (trim($data['content']) === '') {
            return response()->json(['message' => 'Write something first.'], 422);
        }

        $comment->update(['content' => trim($data['content'])]);

        return response()->json($this->shape($comment->fresh()->load('user:id,name,avatar_path'), $request->user()->id));
    }

    public function destroy(Request $request, PodcastComment $comment)
    {
        $user = $request->user();
        abort_unless((int) $comment->user_id === $user->id || $user->is_admin, 403);

        $comment->delete();

        return response()->noContent();
    }

    private function shape(PodcastComment $c, ?int $viewerId): array
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
            'mine' => $viewerId !== null && (int) $c->user_id === $viewerId,
            'replies' => $c->relationLoaded('replies')
                ? $c->replies->map(fn (PodcastComment $r) => $this->shape($r, $viewerId))->values()
                : [],
        ];
    }
}
