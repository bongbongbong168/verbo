<?php

namespace Tests\Feature;

use App\Models\StudyLevel;
use App\Models\User;
use Database\Seeders\DailyUseSituationsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DailyUseSituationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_situations_have_real_lesson_content_and_seeding_twice_changes_nothing(): void
    {
        $author = User::factory()->create(['is_admin' => true]);
        $author->studyLevels()->create([
            'category' => 'daily',
            'title' => 'Ordering Food',
            'description' => 'Existing draft topic',
        ]);

        $this->seed(DailyUseSituationsSeeder::class);
        $this->seed(DailyUseSituationsSeeder::class);

        $levels = StudyLevel::where('category', 'daily')
            ->with('units.texts.lines', 'units.vocabulary', 'units.grammarPoints.examples')
            ->get();

        $this->assertCount(4, $levels);
        $this->assertEqualsCanonicalizing(
            ['Ordering Food', 'Taking a Ride', 'Meeting a Friend', 'Picking Up a Parcel'],
            $levels->pluck('title')->all()
        );
        $this->assertSame('Existing draft topic', $levels->firstWhere('title', 'Ordering Food')->description);
        $this->assertSame('Food & Restaurants', $levels->firstWhere('title', 'Ordering Food')->topic_group);

        foreach ($levels as $level) {
            $this->assertCount(1, $level->units);
            $unit = $level->units->first();
            $this->assertCount(1, $unit->texts);
            $this->assertCount(6, $unit->texts->first()->lines);
            $this->assertGreaterThanOrEqual(7, $unit->vocabulary->count());
            $this->assertCount(1, $unit->grammarPoints);
            $this->assertCount(1, $unit->grammarPoints->first()->examples);
            $this->assertNotEmpty($unit->culture_body);
        }

        $this->actingAs($author)->getJson('/api/study-levels/daily')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Ordering Food'])
            ->assertJsonFragment(['title' => 'Taking a Ride'])
            ->assertJsonFragment(['title' => 'Meeting a Friend'])
            ->assertJsonFragment(['title' => 'Picking Up a Parcel']);
    }
}
