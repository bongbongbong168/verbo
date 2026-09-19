<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A paid request the tutor never answered used to stay "pending" forever,
 * even after its lesson time had passed.
 */
class BookingLapsedRequestTest extends TestCase
{
    use RefreshDatabase;

    private function booking(array $attrs): Booking
    {
        return Booking::forceCreate(array_merge([
            'student_id' => $this->student->id,
            'tutor_id' => $this->tutor->id,
            'duration_minutes' => 60,
        ], $attrs));
    }

    private User $student;

    private User $tutor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->student = User::factory()->create();
        $this->tutor = User::factory()->create();
    }

    public function test_an_unanswered_request_past_its_time_is_expired_and_cannot_be_confirmed(): void
    {
        $late = $this->booking(['status' => 'pending', 'starts_at' => now()->subDays(18)]);
        $soon = $this->booking(['status' => 'pending', 'starts_at' => now()->addDays(2)]);

        $this->assertTrue($late->is_expired);
        $this->assertFalse($late->isLive());
        $this->assertFalse($soon->is_expired);
        $this->assertTrue($soon->isLive());

        Sanctum::actingAs($this->tutor);
        $this->postJson("/api/bookings/{$late->id}/confirm")
            ->assertStatus(422)
            ->assertJsonPath('message', "This lesson's time has already passed.");
        $this->assertSame('pending', $late->fresh()->status);
    }

    public function test_finished_bookings_can_be_cleared_but_live_ones_cannot(): void
    {
        $late = $this->booking(['status' => 'pending', 'starts_at' => now()->subDays(18)]);
        $done = $this->booking(['status' => 'confirmed', 'starts_at' => now()->subDays(3)]);
        $soon = $this->booking(['status' => 'pending', 'starts_at' => now()->addDays(2)]);

        Sanctum::actingAs($this->student);
        $this->deleteJson("/api/bookings/{$late->id}")->assertOk();
        $this->deleteJson("/api/bookings/{$done->id}")->assertOk();
        $this->deleteJson("/api/bookings/{$soon->id}")->assertStatus(422);

        $this->assertNotNull($late->fresh()->hidden_for_student_at);
        $this->assertNull($late->fresh()->hidden_for_tutor_at);
    }

    public function test_clear_past_includes_lapsed_requests(): void
    {
        $late = $this->booking(['status' => 'pending', 'starts_at' => now()->subDays(18)]);
        $soon = $this->booking(['status' => 'pending', 'starts_at' => now()->addDays(2)]);

        Sanctum::actingAs($this->student);
        $this->postJson('/api/bookings/clear-past', ['role' => 'student'])->assertOk();

        $this->assertNotNull($late->fresh()->hidden_for_student_at);
        $this->assertNull($soon->fresh()->hidden_for_student_at);
    }
}
