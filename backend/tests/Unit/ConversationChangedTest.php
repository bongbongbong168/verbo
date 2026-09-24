<?php

namespace Tests\Unit;

use App\Events\ConversationChanged;
use Tests\TestCase;

class ConversationChangedTest extends TestCase
{
    public function test_it_broadcasts_one_private_channel_per_unique_recipient(): void
    {
        $event = new ConversationChanged(42, [7, 7, 0, 12]);

        $channels = $event->broadcastOn();

        $this->assertCount(2, $channels);
        $this->assertSame('private-users.7', $channels[0]->name);
        $this->assertSame('private-users.12', $channels[1]->name);
        $this->assertSame('conversation.changed', $event->broadcastAs());
        $this->assertSame(['conversation_id' => 42, 'change' => 'message.created'], $event->broadcastWith());
    }
}
