<?php

namespace Tests\Feature;

use App\Models\TutorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The tutor's weekly hours.
 *
 * The first test here is the regression that prompted the rest: the editor
 * sends `24:00` whenever a tutor ticks the last half-hour chip of a day, and
 * `date_format:H:i` rejected it — which, because the save is a wholesale
 * replace, threw away the entire week's submission rather than that one row.
 */
class TutorAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    private function tutor(): TutorProfile
    {
        $user = User::create([
            'name' => 'Wen Li',
            'email' => 'wen@example.test',
            'password' => bcrypt('irrelevant'),
        ]);

        return $user->tutorProfile()->create(['bio' => 'Teaches Chinese']);
    }

    public function test_a_window_may_end_at_midnight()
    {
        $profile = $this->tutor();

        $this->actingAs($profile->user)
            ->postJson("/api/tutors/{$profile->id}/availability", [
                'timezone' => 'Asia/Phnom_Penh',
                'slots' => [
                    ['day_of_week' => 3, 'start_time' => '22:00', 'end_time' => '24:00'],
                ],
            ])
            ->assertCreated();

        $this->assertDatabaseHas('tutor_availability', [
            'tutor_profile_id' => $profile->id,
            'day_of_week' => 3,
            'end_time' => '24:00',
        ]);
    }

    /**
     * The failure that actually hurt: one bad row took the whole week with it,
     * so a tutor editing Monday AND ticking the last chip on Wednesday lost
     * both — and the page then looked unchanged after a reload, because it was.
     */
    public function test_one_rejected_row_does_not_wipe_the_rest_of_the_week()
    {
        $profile = $this->tutor();

        $this->actingAs($profile->user)
            ->postJson("/api/tutors/{$profile->id}/availability", [
                'slots' => [
                    ['day_of_week' => 1, 'start_time' => '09:00', 'end_time' => '12:00'],
                    ['day_of_week' => 3, 'start_time' => '22:00', 'end_time' => '24:00'],
                ],
            ])
            ->assertCreated();

        $this->assertSame(2, $profile->availabilitySlots()->count());
    }

    public function test_it_still_refuses_a_time_that_is_not_one()
    {
        $profile = $this->tutor();

        foreach (['25:00', '24:30', '9:00', 'noon'] as $end) {
            $this->actingAs($profile->user)
                ->postJson("/api/tutors/{$profile->id}/availability", [
                    'slots' => [
                        ['day_of_week' => 3, 'start_time' => '09:00', 'end_time' => $end],
                    ],
                ])
                ->assertStatus(422)
                ->assertJsonValidationErrors('slots.0.end_time');
        }
    }

    public function test_it_still_refuses_a_window_that_ends_before_it_starts()
    {
        $profile = $this->tutor();

        $this->actingAs($profile->user)
            ->postJson("/api/tutors/{$profile->id}/availability", [
                'slots' => [
                    ['day_of_week' => 3, 'start_time' => '15:00', 'end_time' => '09:00'],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('slots.0.end_time');
    }

    /** The whole point of `24:00`: it has to generate real bookable times. */
    public function test_a_window_ending_at_midnight_generates_slots_to_2330()
    {
        $profile = $this->tutor();

        $profile->availabilitySlots()->create([
            'day_of_week' => 3,
            'start_time' => '22:00',
            'end_time' => '24:00',
        ]);

        $starts = collect(app(\App\Services\SlotService::class)->forTutor($profile, 14, 30))
            ->map(fn ($slot) => substr($slot['local'], 11))
            ->unique()
            ->sort()
            ->values()
            ->all();

        $this->assertSame(['22:00', '22:30', '23:00', '23:30'], $starts);
    }

    /** Replacing is the contract — the previous week must not survive it. */
    public function test_saving_replaces_the_whole_week()
    {
        $profile = $this->tutor();

        $profile->availabilitySlots()->create([
            'day_of_week' => 1,
            'start_time' => '09:00',
            'end_time' => '10:00',
        ]);

        $this->actingAs($profile->user)
            ->postJson("/api/tutors/{$profile->id}/availability", [
                'slots' => [
                    ['day_of_week' => 3, 'start_time' => '14:00', 'end_time' => '15:00'],
                ],
            ])
            ->assertCreated();

        $this->assertSame(1, $profile->availabilitySlots()->count());
        $this->assertSame(3, (int) $profile->availabilitySlots()->first()->day_of_week);
    }

    /**
     * The empty calendar that read as a bug.
     *
     * A 60-minute lesson cannot sit inside a 30-minute opening, so it has no
     * slots on ANY day — while the 30-minute lessons beside it book fine. The
     * response has to carry enough for the client to say that, rather than
     * "no free 60-minute slots on this day" fourteen times over.
     */
    public function test_the_slot_response_reports_the_longest_window()
    {
        $profile = $this->tutor();

        // Four separate half-hour chips: six hours apart, never contiguous.
        foreach ([['09:00', '09:30'], ['15:00', '15:30']] as [$start, $end]) {
            $profile->availabilitySlots()->create([
                'day_of_week' => 3,
                'start_time' => $start,
                'end_time' => $end,
            ]);
        }

        $short = $profile->lessons()->create(['name' => 'Chat', 'price' => 10, 'duration_minutes' => 30]);
        $long = $profile->lessons()->create(['name' => 'Exam practice', 'price' => 20, 'duration_minutes' => 60]);

        $this->actingAs($profile->user)
            ->getJson("/api/tutors/{$profile->id}/slots?lesson={$long->id}&days=14")
            ->assertOk()
            ->assertJson([
                'duration_minutes' => 60,
                // Hours ARE set — so "hasn't opened any times" would be wrong.
                'has_availability' => true,
                'longest_window_minutes' => 30,
            ])
            ->assertJsonCount(0, 'slots');

        $this->actingAs($profile->user)
            ->getJson("/api/tutors/{$profile->id}/slots?lesson={$short->id}&days=14")
            ->assertOk()
            ->assertJson(['longest_window_minutes' => 30])
            ->assertJsonPath('duration_minutes', 30);

        $this->assertGreaterThan(
            0,
            count($this->getJson("/api/tutors/{$profile->id}/slots?lesson={$short->id}&days=14")->json('slots'))
        );
    }

    /** Contiguous chips collapse into one range, which is what makes room. */
    public function test_a_longer_block_reports_its_real_length()
    {
        $profile = $this->tutor();

        $profile->availabilitySlots()->create([
            'day_of_week' => 3,
            'start_time' => '09:00',
            'end_time' => '11:00',
        ]);

        $this->actingAs($profile->user)
            ->getJson("/api/tutors/{$profile->id}/slots")
            ->assertOk()
            ->assertJson(['longest_window_minutes' => 120]);
    }

    public function test_a_tutor_with_no_hours_reports_zero()
    {
        $profile = $this->tutor();

        $this->actingAs($profile->user)
            ->getJson("/api/tutors/{$profile->id}/slots")
            ->assertOk()
            ->assertJson([
                'has_availability' => false,
                'longest_window_minutes' => 0,
            ]);
    }

    public function test_someone_elses_hours_are_not_editable()
    {
        $profile = $this->tutor();

        $other = User::create([
            'name' => 'Passer By',
            'email' => 'passer@example.test',
            'password' => bcrypt('irrelevant'),
        ]);

        $this->actingAs($other)
            ->postJson("/api/tutors/{$profile->id}/availability", [
                'slots' => [
                    ['day_of_week' => 3, 'start_time' => '09:00', 'end_time' => '10:00'],
                ],
            ])
            ->assertForbidden();

        $this->assertSame(0, $profile->availabilitySlots()->count());
    }
}
