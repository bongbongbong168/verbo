<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * The user's notifications, newest first.
     *
     * `?unread=1` is the "Unread" tab; `?limit=N` is the dropdown, which shows
     * only the most recent few. Everything else pages, so a long history does
     * not arrive in one response.
     */
    public function index(Request $request)
    {
        $query = $request->user()->notifications()
            ->with(['actor:id,name,avatar_path', 'actor.tutorProfile:id,user_id,photo_path'])
            /* By created_at, not id — that is what "newest" actually means,
               and it is the column the (user_id, created_at) index covers.
               id is the tiebreak so rows made in the same second keep a stable
               order across pages. */
            ->latest('created_at')
            ->latest('id');

        if ($request->boolean('unread')) {
            $query->whereNull('read_at');
        }

        // The dropdown asks for a handful; the page pages properly.
        if ($request->filled('limit')) {
            $limit = min(max((int) $request->query('limit'), 1), 20);

            return response()->json([
                'data' => $query->limit($limit)->get(),
                'unread' => $this->countUnread($request),
            ]);
        }

        return response()->json($query->paginate(20));
    }

    /**
     * Just the badge number. Its own endpoint so the bell can poll it without
     * pulling the whole list down every time.
     */
    public function unreadCount(Request $request)
    {
        return response()->json(['unread' => $this->countUnread($request)]);
    }

    /**
     * Mark one read. Used when a notification is clicked, so opening the thing
     * it points at is what clears it.
     */
    public function markRead(Request $request, Notification $notification)
    {
        // Cast: SQLite hands foreign keys back as strings, so a bare !== would
        // 403 the rightful owner.
        abort_unless((int) $notification->user_id === $request->user()->id, 403);

        if (! $notification->read_at) {
            $notification->update(['read_at' => now()]);
        }

        return response()->json($notification->fresh()->load(['actor:id,name,avatar_path', 'actor.tutorProfile:id,user_id,photo_path']));
    }

    /** "Mark all as read". Returns the count so the UI can say what happened. */
    public function markAllRead(Request $request)
    {
        $marked = $request->user()->notifications()
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['marked' => $marked, 'unread' => 0]);
    }

    /**
     * Remove one from the list. A real delete rather than a hidden flag: unlike
     * a booking, a notification belongs to exactly one person, so there is no
     * second party whose record would be destroyed with it.
     */
    public function destroy(Request $request, Notification $notification)
    {
        abort_unless((int) $notification->user_id === $request->user()->id, 403);
        $notification->delete();

        return response()->noContent();
    }

    /**
     * Empty the list.
     *
     * One request rather than one per row: a full list is 50 notifications, and
     * deleting them individually would spend the shared 300/min bucket on
     * tidying up — the same reasoning behind `bookings/clear-past`.
     *
     * Scoped to the caller's own rows by construction: it deletes through
     * `$user->notifications()`, so there is no id to tamper with and no way to
     * reach anyone else's list.
     */
    public function destroyAll(Request $request)
    {
        return response()->json([
            'deleted' => $request->user()->notifications()->delete(),
            'unread' => 0,
        ]);
    }

    private function countUnread(Request $request): int
    {
        return $request->user()->notifications()->whereNull('read_at')->count();
    }
}
