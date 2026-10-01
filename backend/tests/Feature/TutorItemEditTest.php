<?php

namespace Tests\Feature;

use App\Models\TutorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Editing a lesson, a resume entry and a course in place (the drawer pencil). */
class TutorItemEditTest extends TestCase
{
    use RefreshDatabase;

    private function tutor(): array
    {
        $user = User::factory()->create();
        $profile = $user->tutorProfile()->create(['bio' => 'A tutor.', 'subjects' => 'Chinese']);
        $profile->forceFill(['status' => TutorProfile::APPROVED])->save();

        return [$user, $profile];
    }

    public function test_the_owner_edits_a_lesson_and_the_trial_flag_stays_unique(): void
    {
        [$user, $profile] = $this->tutor();
        Sanctum::actingAs($user);

        $trial = $profile->lessons()->create(['name' => 'Trial', 'price' => 5, 'duration_minutes' => 30, 'is_trial' => true]);
        $other = $profile->lessons()->create(['name' => 'HSK', 'price' => 20, 'duration_minutes' => 60, 'is_trial' => false]);

        $this->putJson("/api/tutor-lessons/{$other->id}", [
            'name' => 'HSK 3 Practice', 'price' => 22, 'duration_minutes' => 60, 'is_trial' => true,
        ])->assertOk()->assertJsonPath('name', 'HSK 3 Practice')->assertJsonPath('price', 22);

        $this->assertFalse((bool) $trial->fresh()->is_trial);
        $this->assertTrue((bool) $other->fresh()->is_trial);
    }

    public function test_someone_else_cannot_edit_the_lesson(): void
    {
        [, $profile] = $this->tutor();
        $lesson = $profile->lessons()->create(['name' => 'Trial', 'price' => 5, 'duration_minutes' => 30]);

        Sanctum::actingAs(User::factory()->create());
        $this->putJson("/api/tutor-lessons/{$lesson->id}", [
            'name' => 'Hijacked', 'price' => 0, 'duration_minutes' => 30,
        ])->assertForbidden();
        $this->assertSame('Trial', $lesson->fresh()->name);
    }

    public function test_the_owner_edits_a_resume_entry(): void
    {
        [$user, $profile] = $this->tutor();
        Sanctum::actingAs($user);
        $entry = $profile->resumeEntries()->create(['section' => 'Education', 'title' => 'BA', 'position' => 1]);

        $this->putJson("/api/tutor-resume/{$entry->id}", [
            'section' => 'Education', 'title' => 'BA Chinese', 'years' => '2016 - 2020',
        ])->assertOk()->assertJsonPath('title', 'BA Chinese');
    }

    public function test_course_capacity_cannot_drop_below_seats_taken(): void
    {
        [$user, $profile] = $this->tutor();
        Sanctum::actingAs($user);
        $course = $profile->courses()->create([
            'title' => 'Weekend', 'price' => 45, 'weeks' => 4, 'total_classes' => 4, 'classes_per_week' => 1,
            'minutes_per_class' => 60, 'capacity' => 6, 'starts_on' => now()->addWeek()->toDateString(),
            'ends_on' => now()->addWeeks(5)->toDateString(), 'days_of_week' => [6], 'start_time' => '10:00', 'end_time' => '11:00',
        ]);
        foreach (User::factory()->count(3)->create() as $student) {
            $course->enrollments()->create(['user_id' => $student->id, 'status' => 'confirmed']);
        }

        $body = [
            'title' => 'Weekend Clinic', 'price' => 45, 'weeks' => 4, 'total_classes' => 4, 'classes_per_week' => 1,
            'minutes_per_class' => 60, 'starts_on' => $course->starts_on->toDateString(), 'ends_on' => $course->ends_on->toDateString(),
            'days_of_week' => [6], 'start_time' => '10:00', 'end_time' => '11:00',
        ];

        $this->putJson("/api/courses/{$course->id}", $body + ['capacity' => 2])->assertStatus(422);
        $this->putJson("/api/courses/{$course->id}", $body + ['capacity' => 3])
            ->assertOk()->assertJsonPath('title', 'Weekend Clinic');
    }
}
