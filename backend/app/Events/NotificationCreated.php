<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * A content-free signal that one user has a new notification.
 *
 * Same rule as ConversationChanged: the payload is an id only, and the client
 * loads the row through the authenticated API, so no names, times or message
 * text ever pass through the realtime provider. The channel is the owner's
 * private `users.{id}`, whose auth rule admits only that account.
 */
class NotificationCreated implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(private int $userId, public int $notificationId)
    {
    }

    public function broadcastOn(): array
    {
        return [new PrivateChannel('users.'.$this->userId)];
    }

    public function broadcastAs(): string
    {
        return 'notification.created';
    }

    public function broadcastWith(): array
    {
        return ['id' => $this->notificationId];
    }
}
