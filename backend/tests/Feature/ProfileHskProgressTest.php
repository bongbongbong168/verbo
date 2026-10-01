<?php

namespace Tests\Feature;

use App\Models\StudyUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileHskProgressTest extends TestCase
{
    use RefreshDatabase;

    public function test_newer_daily_use_lesson_does_not_replace_hsk_profile_progress(): void
    {
        $user = User::factory()->create();
        $hsk = $user->studyLevels()->create(['title' => 'HSK 1', 'category' => 'hsk']);
        $unit = $hsk->units()->create(['title' => 'First lesson']);
        $hsk->units()->create(['title' => 'Second lesson']);
        $daily = $user->studyLevels()->create(['title' => 'Taking a Ride', 'category' => 'daily']);
        $dailyUnit = $daily->units()->create(['title' => 'Stop up ahead']);
        $user->recentViews()->create([
            'viewable_type' => StudyUnit::class,
            'viewable_id' => $unit->id,
            'last_viewed_at' => now()->subHour(),
        ]);
        $user->recentViews()->create([
            'viewable_type' => StudyUnit::class,
            'viewable_id' => $dailyUnit->id,
            'last_viewed_at' => now(),
        ]);

        $this->actingAs($user)->getJson('/api/user/overview')
            ->assertOk()
            ->assertJsonPath('level.title', 'HSK 1')
            ->assertJsonPath('level.units_total', 2)
            ->assertJsonPath('level.units_opened', 1)
            ->assertJsonPath('level.percent', 50)
            ->assertJsonCount(1, 'books')
            ->assertJsonPath('books.0.title', 'HSK 1');
    }

    public function test_daily_use_only_learner_has_no_hsk_level_or_books(): void
    {
        $user = User::factory()->create();
        $daily = $user->studyLevels()->create(['title' => 'Meeting a Friend', 'category' => 'daily']);
        $unit = $daily->units()->create(['title' => 'Almost there']);
        $user->recentViews()->create([
            'viewable_type' => StudyUnit::class,
            'viewable_id' => $unit->id,
            'last_viewed_at' => now(),
        ]);

        $this->actingAs($user)->getJson('/api/user/overview')
            ->assertOk()
            ->assertJsonPath('level', null)
            ->assertJsonCount(0, 'books');
    }
}
