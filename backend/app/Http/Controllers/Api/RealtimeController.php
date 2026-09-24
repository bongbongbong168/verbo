<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\Request;

/**
 * Notification-only long-poll connection.
 *
 * Conversation updates travel through Pusher now. Notifications stay on this
 * small compatibility path until their own delivery is moved to broadcast.
 */
class RealtimeController extends Controller
{
    public function poll(Request $request)
    {
        $data = $request->validate([
            'after_notification_id' => ['nullable', 'integer', 'min:0'],
            'bootstrap' => ['nullable', 'boolean'],
        ]);
        $user = $request->user();
        $notificationAfter = (int) ($data['after_notification_id'] ?? 0);

        if (!empty($data['bootstrap'])) {
            return $this->noStore($this->payload($user->id, $notificationAfter, true));
        }

        // Long-polling is one client connection, not an interval of requests.
        // The loop ends promptly on an event, otherwise after 20 seconds.
        for ($i = 0; $i < 20; $i++) {
            $payload = $this->payload($user->id, $notificationAfter);
            // `notifications` is a Collection, and an object is always truthy
            // in PHP — testing it bare made every request return at once, and
            // the client's immediate re-poll turned into ~850 requests a
            // minute, 429-ing the whole app. Ask whether it is empty.
            if ($payload['notifications']->isNotEmpty() || connection_aborted()) {
                return $this->noStore($payload);
            }
            usleep(1000000);
        }

        return $this->noStore($this->payload($user->id, $notificationAfter));
    }

    private function noStore(array $payload)
    {
        return response()->json($payload)->header('Cache-Control', 'no-store, private');
    }

    private function payload(int $userId, int $notificationAfter, bool $bootstrap = false): array
    {
        $notifications = $bootstrap ? collect() : Notification::where('user_id', $userId)
            ->where('id', '>', $notificationAfter)->orderBy('id')->get(['id']);

        return [
            'notifications' => $notifications->pluck('id'),
            'after_notification_id' => max($notificationAfter, (int) (Notification::where('user_id', $userId)->max('id') ?? 0)),
            'unread_notifications' => Notification::where('user_id', $userId)->whereNull('read_at')->count(),
        ];
    }
}
