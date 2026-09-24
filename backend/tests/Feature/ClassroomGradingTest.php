<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\Submission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ClassroomGradingTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_teacher_cannot_give_more_than_100_points(): void
    {
        $teacher = User::factory()->create();
        $student = User::factory()->create();
        $classroom = Classroom::forceCreate([
            'user_id' => $teacher->id,
            'name' => 'HSK writing',
            'join_code' => 'HSKX-3EK2',
        ]);
        $item = $classroom->items()->create([
            'type' => 'assignment',
            'title' => 'Writing practice',
            'points' => 1000,
        ]);
        $submission = Submission::create([
            'classroom_item_id' => $item->id,
            'user_id' => $student->id,
            'submitted_at' => now(),
        ]);

        Sanctum::actingAs($teacher);

        $this->postJson("/api/submissions/{$submission->id}/grade", [
            'score' => 101,
            'feedback' => 'Over the limit.',
        ])->assertUnprocessable()->assertJsonValidationErrors('score');

        $this->assertDatabaseHas('submissions', [
            'id' => $submission->id,
            'score' => null,
        ]);

        $this->postJson("/api/submissions/{$submission->id}/grade", [
            'score' => 100,
            'feedback' => 'Excellent work.',
        ])->assertOk();

        $this->assertDatabaseHas('submissions', [
            'id' => $submission->id,
            'score' => 100,
        ]);
    }
}
