<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\Request;

/**
 * Notification compatibility endpoint.
 *
 * Conversation updates travel through Pusher. This endpoint deliberately
 * returns immediately: keeping a PHP worker waiting for each open tab made
 * ordinary page loads queue behind old notification requests.
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
