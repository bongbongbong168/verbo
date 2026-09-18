<?php

namespace Tests\Feature;

use App\Models\StudyLevel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StudyUnitCompletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_finished_lesson_is_greyed_for_that_learner_only(): void
    {
        $author = User::factory()->create(['is_admin' => true]);
        $level = StudyLevel::forceCreate(['user_id' => $author->id, 'title' => 'HSK 3', 'category' => 'hsk']);
        $one = $level->units()->forceCreate(['title' => 'Unit 1']);
        $level->units()->forceCreate(['title' => 'Unit 2']);

        $me = User::factory()->create();
        Sanctum::actingAs($me);

        $this->postJson("/api/study-units/{$one->id}/complete")->assertOk()->assertJsonPath('completed', true);
        // Twice is harmless.
        $this->postJson("/api/study-units/{$one->id}/complete")->assertOk();

        $this->getJson("/api/study-levels/{$level->id}")
            ->assertJsonPath('units.0.completed', true)
            ->assertJsonPath('units.1.completed', false);
        $this->getJson("/api/study-units/{$one->id}")->assertJsonPath('completed', true);

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/study-levels/{$level->id}")->assertJsonPath('units.0.completed', false);

        Sanctum::actingAs($me);
        $this->deleteJson("/api/study-units/{$one->id}/complete")->assertOk()->assertJsonPath('completed', false);
        $this->getJson("/api/study-units/{$one->id}")->assertJsonPath('completed', false);
    }
}
