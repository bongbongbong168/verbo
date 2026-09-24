<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * A private, content-free signal that a conversation changed.
 *
 * The receiver loads the message from Verbo's normal authenticated API. This
 * keeps message bodies and attachment metadata out of the broadcast payload.
 */
class ConversationChanged implements ShouldBroadcastNow
{
    /* Without this trait `ConversationChanged::dispatch()` is an undefined
       method. The controller's try/catch swallowed that error, so for as long
       as this was missing no chat update was ever broadcast. */
    use Dispatchable;

    public function __construct(
        public int $conversationId,
        private array $recipientIds,
        public string $change = 'message.created',
    ) {
    }

    public function broadcastOn(): array
    {
        return array_map(
            fn (int $id) => new PrivateChannel('users.'.$id),
            array_values(array_unique(array_filter(array_map('intval', $this->recipientIds))))
        );
    }

    public function broadcastAs(): string
    {
        return 'conversation.changed';
    }

    public function broadcastWith(): array
    {
        return [
            'conversation_id' => $this->conversationId,
            'change' => $this->change,
        ];
    }
}
