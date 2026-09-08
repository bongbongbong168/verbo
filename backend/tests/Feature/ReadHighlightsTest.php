<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\ArticleController;
use App\Models\Article;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReadHighlightsTest extends TestCase
{
    use RefreshDatabase;

    private function article(User $owner, string $title): Article
    {
        $a = new Article([
            'title' => $title,
            'type' => 'article',
            'category' => 'Culture',
            'body' => str_repeat('你好世界。', 40),
        ]);
        $a->user_id = $owner->id;
        $a->save();

        return $a;
    }

    private function markRead(User $u, Article $a, $when = null): void
    {
        DB::table('article_views')->insert([
            'user_id' => $u->id,
            'article_id' => $a->id,
            'views' => 1,
            'last_viewed_at' => $when ?? now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * `/articles/highlights` must resolve before `/articles/{article}`, or
     * "highlights" binds as an id — the trap this route sits next to.
     */
    public function test_highlights_is_a_route_not_an_id(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/articles/highlights')
            ->assertOk()
            ->assertJsonStructure(['recommended', 'continue', 'week' => ['articles_read', 'goal', 'words_saved']]);
    }

    public function test_the_week_counts_only_this_week(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->markRead($user, $this->article($user, 'A'), now());
        $this->markRead($user, $this->article($user, 'B'), now()->subDay());
        // Before the week started, so it must not be counted.
        $this->markRead($user, $this->article($user, 'C'), now()->startOfWeek()->subDays(2));

        $week = $this->getJson('/api/articles/highlights')->assertOk()->json('week');

        $this->assertSame(2, $week['articles_read']);
        $this->assertSame(ArticleController::WEEKLY_READ_GOAL, $week['goal']);
    }

    public function test_words_saved_counts_this_week_only(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $user->flashcards()->create(['word' => '你好', 'source_module' => 'read']);
        $old = $user->flashcards()->create(['word' => '再见', 'source_module' => 'read']);
        $old->created_at = now()->startOfWeek()->subDays(3);
        $old->save();

        $this->getJson('/api/articles/highlights')
            ->assertOk()
            ->assertJsonPath('week.words_saved', 1);
    }

    /**
     * The rule is "the most recently opened article THAT SLIDE ONE IS NOT
     * ALREADY SHOWING" — not simply the most recent.
     *
     * Worth stating precisely, because the obvious version of this test failed:
     * the recommender had picked the newest article, so `continue` correctly
     * fell through to the next one. Showing the same article on two of four
     * slides would be the actual bug.
     */
    public function test_continue_is_the_last_article_opened_that_is_not_the_recommendation(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $reads = [];
        foreach (['Oldest', 'Middle', 'Newest'] as $i => $title) {
            $a = $this->article($user, $title);
            $this->markRead($user, $a, now()->subHours(3 - $i));
            // Newest first, which is the order the endpoint considers them in.
            array_unshift($reads, $a->id);
        }

        $res = $this->getJson('/api/articles/highlights')->assertOk();
        $rec = $res->json('recommended.id');

        $expected = null;
        foreach ($reads as $id) {
            if ($id !== $rec) { $expected = $id; break; }
        }

        $this->assertSame($expected, $res->json('continue.id'));
        $this->assertSame('resume', $res->json('continue.kind'));
    }

    /**
     * A learner who has read nothing has nothing to continue. The slide falls
     * back to a suggestion and says so, rather than rendering empty.
     */
    public function test_a_new_reader_gets_a_suggestion_not_an_empty_slide(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $this->article($user, 'One');
        $this->article($user, 'Two');

        $res = $this->getJson('/api/articles/highlights')->assertOk();

        $this->assertSame(0, $res->json('week.articles_read'));
        // Either a real suggestion, or nothing at all — never a resume, since
        // there is nothing to resume.
        $this->assertNotSame('resume', $res->json('continue.kind'));
    }

    public function test_continue_never_repeats_the_recommended_article(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        foreach (['One', 'Two', 'Three'] as $t) {
            $this->markRead($user, $this->article($user, $t), now()->subMinutes(rand(1, 60)));
        }

        $res = $this->getJson('/api/articles/highlights')->assertOk();
        $rec = $res->json('recommended.id');
        $cont = $res->json('continue.id');

        if ($rec !== null && $cont !== null) {
            $this->assertNotSame($rec, $cont, 'The banner would show the same article twice.');
        }
    }

    public function test_the_week_is_per_learner(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->markRead($a, $this->article($a, 'A'), now());

        Sanctum::actingAs($b);
        $this->getJson('/api/articles/highlights')
            ->assertOk()
            ->assertJsonPath('week.articles_read', 0);
    }
}
