<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MyTutorsTest extends TestCase
{
    use RefreshDatabase;

    private function book(User $student, User $tutor, string $status, string $when): void
    {
        $b = new Booking(['status' => $status, 'starts_at' => now()->modify($when)]);
        $b->student_id = $student->id;
        $b->tutor_id = $tutor->id;
        $b->save();
    }

    private function tutors(User $u): array
    {
        return $this->actingAs($u)->getJson('/api/user/overview')->assertOk()->json();
    }

    public function test_status_lines_and_what_counts(): void
    {
        $me = User::factory()->create();
        [$next, $waiting, $past, $held, $lapsed] = User::factory()->count(5)->create();

        $this->book($me, $next, 'confirmed', '+2 days');
        $this->book($me, $waiting, 'pending', '+3 days');
        $this->book($me, $past, 'confirmed', '-5 days');
        $this->book($me, $held, 'held', '+1 day');      // unpaid hold: not a tutor
        $this->book($me, $lapsed, 'pending', '-1 day'); // never answered: not a tutor

        $rows = collect($this->tutors($me)['tutors'])->keyBy('id');

        $this->assertEqualsCanonicalizing([$next->id, $waiting->id, $past->id], $rows->keys()->all());
        $this->assertNotNull($rows[$next->id]['next_lesson_at']);
        $this->assertNotNull($rows[$waiting->id]['waiting_since']);
        $this->assertNotNull($rows[$past->id]['last_lesson_at']);
        $this->assertTrue($rows[$past->id]['done']);
        $this->assertFalse($rows[$next->id]['done']);
        // Upcoming comes first.
        $this->assertSame($next->id, $this->tutors($me)['tutors'][0]['id']);
    }

    public function test_hide_only_when_done_and_unhide(): void
    {
        $me = User::factory()->create();
        [$done, $live] = User::factory()->count(2)->create();
        $this->book($me, $done, 'confirmed', '-3 days');
        $this->book($me, $live, 'confirmed', '+3 days');

        $this->actingAs($me)->postJson("/api/user/tutors/{$live->id}/hide")->assertStatus(422);

        $this->actingAs($me)->postJson("/api/user/tutors/{$done->id}/hide")->assertOk();
        $data = $this->tutors($me);
        $this->assertSame([$live->id], array_column($data['tutors'], 'id'));
        $this->assertSame([$done->id], array_column($data['hidden_tutors'], 'id'));

        // Booking again brings them back.
        $this->book($me, $done, 'confirmed', '+5 days');
        $this->assertContains($done->id, array_column($this->tutors($me)['tutors'], 'id'));

        $this->actingAs($me)->deleteJson("/api/user/tutors/{$done->id}/hide")->assertOk();
    }
}
