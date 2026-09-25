<?php

namespace Tests\Feature;

use App\Events\ConversationChanged;
use App\Models\Conversation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Live chat depends on three things that each failed silently before:
 * the private channel must authorise its owner, a send must broadcast to the
 * other side, and reading must broadcast back so the sender sees "Read".
 */
class ConversationRealtimeTest extends TestCase
{
    use RefreshDatabase;

    private function thread(): array
    {
        $tutor = User::factory()->create();
        $student = User::factory()->create();
        $conversation = Conversation::forceCreate([
            'type' => Conversation::TYPE_TUTOR,
            'tutor_id' => $tutor->id,
            'student_id' => $student->id,
            'last_message_at' => now(),
        ]);

        return [$tutor, $student, $conversation];
    }

    private function usePusher(): void
    {
        // Signing a subscription is local HMAC work; nothing reaches Pusher.
        config([
            'broadcasting.default' => 'pusher',
            'broadcasting.connections.pusher.key' => 'test-key',
            'broadcasting.connections.pusher.secret' => 'test-secret',
            'broadcasting.connections.pusher.app_id' => '1',
        ]);
        // Channels attach to the broadcaster that was active when they were
        // registered, and the suite boots on a different one. Production boots
        // on pusher, so registering them again here is what it sees.
        require base_path('routes/channels.php');
    }

    public function test_a_user_may_subscribe_to_their_own_private_channel(): void
    {
        $this->usePusher();
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        // Failed with 403 while routes/channels.php was never loaded.
        $this->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "private-users.{$user->id}",
        ])->assertOk()->assertJsonStructure(['auth']);
    }

    public function test_a_user_may_not_subscribe_to_someone_elses_channel(): void
    {
        $this->usePusher();
        $user = User::factory()->create();
        $other = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "private-users.{$other->id}",
        ])->assertForbidden();
    }

    public function test_sending_broadcasts_to_the_other_side_only(): void
    {
        Event::fake([ConversationChanged::class]);
        [$tutor, $student, $conversation] = $this->thread();
        Sanctum::actingAs($student);

        $this->postJson("/api/conversations/{$conversation->id}/messages", ['body' => '你好'])
            ->assertCreated();

        Event::assertDispatched(ConversationChanged::class, function ($e) use ($tutor, $conversation) {
            $channels = array_map(fn ($c) => $c->name, $e->broadcastOn());

            return $e->conversationId === $conversation->id
                && $e->change === 'message.created'
                && $channels === ["private-users.{$tutor->id}"];
        });
    }

    public function test_reading_tells_the_sender_and_only_when_something_was_unread(): void
    {
        [$tutor, $student, $conversation] = $this->thread();
        Sanctum::actingAs($student);
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['body' => '你好']);

        Event::fake([ConversationChanged::class]);
        Sanctum::actingAs($tutor);
        $this->getJson("/api/conversations/{$conversation->id}")->assertOk();

        Event::assertDispatched(ConversationChanged::class, function ($e) use ($student) {
            $channels = array_map(fn ($c) => $c->name, $e->broadcastOn());

            return $e->change === 'messages.read' && $channels === ["private-users.{$student->id}"];
        });

        // Opening it again changes nothing, so nobody is pinged.
        Event::fake([ConversationChanged::class]);
        $this->getJson("/api/conversations/{$conversation->id}")->assertOk();
        Event::assertNotDispatched(ConversationChanged::class);
    }

    public function test_retrying_a_send_with_the_same_client_id_returns_one_message(): void
    {
        Event::fake([ConversationChanged::class]);
        [$tutor, $student, $conversation] = $this->thread();
        Sanctum::actingAs($student);
        $payload = ['body' => 'Can we practise tomorrow?', 'client_id' => 'demo-send-123'];

        $first = $this->postJson("/api/conversations/{$conversation->id}/messages", $payload)
            ->assertCreated()
            ->assertJsonPath('client_id', 'demo-send-123');
        $this->postJson("/api/conversations/{$conversation->id}/messages", $payload)
            ->assertOk()
            ->assertJsonPath('id', $first->json('id'));

        $this->assertSame(1, $conversation->messages()->count());
        $this->assertSame(1, $tutor->notifications()->where('type', 'message')->count());
        Event::assertDispatchedTimes(ConversationChanged::class, 1);

        $this->getJson("/api/conversations/{$conversation->id}")
            ->assertOk()
            ->assertJsonPath('messages.0.client_id', 'demo-send-123');
    }
}
