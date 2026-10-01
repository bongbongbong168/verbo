<?php

namespace Tests\Feature;

use App\Events\NotificationCreated;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationToastTest extends TestCase
{
    use RefreshDatabase;

    public function test_raising_signals_only_the_owner_with_no_content(): void
    {
        Event::fake([NotificationCreated::class]);
        [$student, $tutor] = User::factory()->count(2)->create();

        Notification::raise($student->id, $tutor->id, 'booking_confirmed', [
            'title' => 'Booking accepted',
            'body' => 'x',
            'data' => ['booking_id' => 7, 'starts_at' => '2026-09-28T11:00:00+00:00'],
        ]);

        Event::assertDispatched(NotificationCreated::class, function ($e) use ($student) {
            $channels = array_map(fn ($c) => $c->name, $e->broadcastOn());

            return $channels === ['private-users.'.$student->id]
                && array_keys($e->broadcastWith()) === ['id'];
        });
    }

    public function test_since_starts_at_the_watermark_and_is_scoped_to_the_caller(): void
    {
        [$student, $other, $tutor] = User::factory()->count(3)->create();
        Notification::raise($student->id, $tutor->id, 'message', ['title' => 'old']);

        Sanctum::actingAs($student);
        $mark = $this->getJson('/api/notifications/since')->assertOk()
            ->assertJsonCount(0, 'data')->json('latest_id');

        Notification::raise($student->id, $tutor->id, 'booking_confirmed', [
            'title' => 'Booking accepted',
            'data' => ['starts_at' => '2026-09-28T11:00:00+00:00'],
        ]);
        Notification::raise($other->id, $tutor->id, 'message', ['title' => 'not yours']);

        $this->getJson('/api/notifications/since?after='.$mark)->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.type', 'booking_confirmed')
            ->assertJsonPath('data.0.data.starts_at', '2026-09-28T11:00:00+00:00')
            ->assertJsonPath('data.0.actor.name', $tutor->name);

        // The other student's row never reaches this account.
        Sanctum::actingAs($other);
        $this->getJson('/api/notifications/since?after=0')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'not yours');
    }
}
