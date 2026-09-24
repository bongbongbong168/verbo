<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CourseConversationAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_outsider_cannot_create_a_course_conversation(): void
    {
        $tutor = User::factory()->create();
        $outsider = User::factory()->create();
        $profile = $tutor->tutorProfile()->create(['bio' => 'Teaches Chinese']);
        $course = Course::forceCreate([
            'tutor_profile_id' => $profile->id,
            'title' => 'HSK 1 foundations',
            'price' => 20,
            'weeks' => 4,
            'total_classes' => 8,
            'classes_per_week' => 2,
            'minutes_per_class' => 60,
            'capacity' => 10,
            'starts_on' => now()->addWeek()->toDateString(),
            'ends_on' => now()->addWeeks(5)->toDateString(),
            'days_of_week' => [1, 3],
            'start_time' => '09:00:00',
            'end_time' => '10:00:00',
        ]);

        Sanctum::actingAs($outsider);

        $this->postJson("/api/courses/{$course->id}/conversation")
            ->assertForbidden();

        $this->assertDatabaseMissing('conversations', [
            'type' => Conversation::TYPE_COURSE,
            'course_id' => $course->id,
        ]);
    }
}
