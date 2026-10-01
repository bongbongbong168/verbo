<?php

namespace Tests\Feature;

use App\Models\Article;
use App\Models\DailyQuest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The "quest complete" header: sent once, only when a quest really finishes. */
class QuestCelebrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_finishing_a_quest_sends_the_header_once(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        DailyQuest::create([
            'user_id' => $user->id, 'day' => now()->toDateString(), 'area' => 'input',
            'quest_key' => 'read_article', 'level' => 'easy',
        ]);
        $a = $user->articles()->create(['title' => 'A', 'type' => 'article', 'body' => '你好']);
        $b = $user->articles()->create(['title' => 'B', 'type' => 'article', 'body' => '你好']);

        $first = $this->postJson("/api/articles/{$a->id}/view")->assertSuccessful();
        $sent = json_decode($first->headers->get('X-Verbo-Quests'), true);
        $this->assertSame('book', $sent[0]['mark']);
        $this->assertSame('Read 1 article', $sent[0]['label']);

        // Already celebrated: a second article does not announce it again.
        $this->postJson("/api/articles/{$b->id}/view")->assertSuccessful()
            ->assertHeaderMissing('X-Verbo-Quests');
    }

    public function test_an_unfinished_quest_sends_nothing(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        DailyQuest::create([
            'user_id' => $user->id, 'day' => now()->toDateString(), 'area' => 'input',
            'quest_key' => 'read_article', 'level' => 'hard',
        ]);
        $a = $user->articles()->create(['title' => 'A', 'type' => 'article', 'body' => '你好']);

        $this->postJson("/api/articles/{$a->id}/view")->assertSuccessful()
            ->assertHeaderMissing('X-Verbo-Quests');
    }
}
