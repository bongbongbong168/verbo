<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\DailyQuests;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The daily-time answer sets the level a new day's quests start at. */
class QuestStartingLevelTest extends TestCase
{
    use RefreshDatabase;

    private function levelsFor(?string $goal): array
    {
        $user = User::factory()->create();
        if ($goal) {
            $user->learningPreference()->create(['daily_goal' => $goal]);
        }

        return array_unique(array_column(app(DailyQuests::class)->forToday($user->fresh()), 'level'));
    }

    public function test_daily_time_maps_to_quest_level(): void
    {
        $this->assertSame(['easy'], $this->levelsFor('15 minutes'));
        $this->assertSame(['normal'], $this->levelsFor('30 minutes'));
        $this->assertSame(['normal'], $this->levelsFor('Whenever I have time'));
        $this->assertSame(['normal'], $this->levelsFor(null));
        $this->assertSame(['hard'], $this->levelsFor('1 hour or more'));
    }
}
