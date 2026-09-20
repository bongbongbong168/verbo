<?php

namespace Tests\Feature;

use App\Models\Article;
use App\Models\DailyQuest;
use App\Models\Flashcard;
use App\Models\LearningPreference;
use App\Models\Podcast;
use App\Models\PodcastListenDay;
use App\Models\StudyLevel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DailyQuestTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_day_is_one_quest_from_each_area(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);

        $areas = collect($this->getJson('/api/daily-quests')->assertOk()->json('quests'))
            ->pluck('area')
            ->all();

        $this->assertSame(['input', 'vocabulary', 'practice'], $areas);
        // Asking again is the same day, not three more quests.
        $this->getJson('/api/daily-quests')->assertOk();
        $this->assertSame(3, DailyQuest::where('user_id', $me->id)->count());
    }

    public function test_the_first_pick_follows_the_learners_own_answers(): void
    {
        $me = User::factory()->create();
        LearningPreference::forceCreate([
            'user_id' => $me->id,
            'focus' => ['Listening'],
            'styles' => ['Flashcards'],
        ]);
        Sanctum::actingAs($me);

        $quests = collect($this->getJson('/api/daily-quests')->json('quests'))->keyBy('area');

        $this->assertSame('listen_podcast', $quests['input']['key']);
        $this->assertStringContainsString('listening', $quests['input']['why']);
        // A learner who said nothing is told so, rather than sold a
        // personalisation that did not happen.
        Sanctum::actingAs(User::factory()->create());
        $plain = collect($this->getJson('/api/daily-quests')->json('quests'))->first();
        $this->assertStringContainsString('Verbo picks one quest', $plain['why']);
    }

    public function test_progress_counts_real_activity_and_clamps(): void
    {
        $me = User::factory()->create();
        $author = User::factory()->create(['is_admin' => true]);
        Sanctum::actingAs($me);
        $quest = DailyQuest::create([
            'user_id' => $me->id, 'day' => Carbon::today()->toDateString(),
            'area' => 'input', 'quest_key' => 'read_article', 'level' => 'easy',
        ]);

        $one = Article::forceCreate(['user_id' => $author->id, 'title' => 'A', 'type' => 'article', 'body' => '你好']);
        $two = Article::forceCreate(['user_id' => $author->id, 'title' => 'B', 'type' => 'article', 'body' => '你好']);
        foreach ([$one, $two] as $article) {
            DB::table('article_views')->insert([
                'user_id' => $me->id, 'article_id' => $article->id, 'views' => 1,
                'last_viewed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $shown = collect($this->getJson('/api/daily-quests')->json('quests'))->firstWhere('id', $quest->id);
        // Easy is 1 article, two were read: clamped, and done.
        $this->assertSame(1, $shown['progress']);
        $this->assertSame(1, $shown['target']);
        $this->assertTrue($shown['done']);
    }

    public function test_learning_a_word_means_the_first_right_answer_not_saving_it(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);
        DailyQuest::create([
            'user_id' => $me->id, 'day' => Carbon::today()->toDateString(),
            'area' => 'vocabulary', 'quest_key' => 'learn_words', 'level' => 'easy',
        ]);
        $card = Flashcard::forceCreate(['user_id' => $me->id, 'word' => '机场']);

        $quests = collect($this->getJson('/api/daily-quests')->json('quests'));
        $this->assertSame(0, $quests->firstWhere('key', 'learn_words')['progress'], 'saving is not learning');

        $this->postJson("/api/flashcards/{$card->id}/grade", ['correct' => false])->assertOk();
        $quests = collect($this->getJson('/api/daily-quests')->json('quests'));
        $this->assertSame(0, $quests->firstWhere('key', 'learn_words')['progress'], 'a wrong answer is not learning');

        $this->postJson("/api/flashcards/{$card->id}/grade", ['correct' => true])->assertOk();
        $quests = collect($this->getJson('/api/daily-quests')->json('quests'));
        $this->assertSame(1, $quests->firstWhere('key', 'learn_words')['progress']);

        // Answering the same word right again does not count twice.
        $stamped = $card->fresh()->first_correct_at;
        $this->postJson("/api/flashcards/{$card->id}/grade", ['correct' => true])->assertOk();
        $this->assertEquals($stamped, $card->fresh()->first_correct_at);
    }

    public function test_listening_counts_forward_playback_only_and_is_capped(): void
    {
        $me = User::factory()->create();
        $author = User::factory()->create(['is_admin' => true]);
        Sanctum::actingAs($me);
        $podcast = Podcast::forceCreate(['user_id' => $author->id, 'title' => 'Ep', 'transcript' => '你好']);

        // Two ordinary reports 15s apart.
        $this->putJson("/api/podcasts/{$podcast->id}/progress", ['position_seconds' => 15, 'duration_seconds' => 600]);
        $this->putJson("/api/podcasts/{$podcast->id}/progress", ['position_seconds' => 30, 'duration_seconds' => 600]);
        $this->assertSame(30, PodcastListenDay::secondsToday($me->id));

        // A jump forward credits the cap, not the jump.
        $this->putJson("/api/podcasts/{$podcast->id}/progress", ['position_seconds' => 590, 'duration_seconds' => 600]);
        $this->assertSame(30 + PodcastListenDay::MAX_CREDIT_SECONDS, PodcastListenDay::secondsToday($me->id));

        // Seeking backwards credits nothing.
        $this->putJson("/api/podcasts/{$podcast->id}/progress", ['position_seconds' => 5, 'duration_seconds' => 600]);
        $this->assertSame(30 + PodcastListenDay::MAX_CREDIT_SECONDS, PodcastListenDay::secondsToday($me->id));
    }

    public function test_a_quest_can_be_swapped_within_its_area_but_not_across_it(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);
        $quests = collect($this->getJson('/api/daily-quests')->json('quests'));
        $input = $quests->firstWhere('area', 'input');

        $this->getJson("/api/daily-quests/{$input['id']}/options")
            ->assertOk()
            ->assertJsonPath('area', 'input')
            ->assertJsonPath('changes_left', 2);

        $this->postJson("/api/daily-quests/{$input['id']}/change", ['key' => 'listen_podcast'])
            ->assertOk()
            ->assertJsonPath('quest.key', 'listen_podcast')
            ->assertJsonPath('quest.changes_left', 1);

        // A vocabulary quest cannot fill the input slot: a day stays one of each.
        $this->postJson("/api/daily-quests/{$input['id']}/change", ['key' => 'review_words'])
            ->assertStatus(422);
        $this->postJson("/api/daily-quests/{$input['id']}/change", ['key' => 'nonsense'])
            ->assertStatus(422);
    }

    public function test_swaps_are_capped_so_the_picker_cannot_be_shopped(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);
        $input = collect($this->getJson('/api/daily-quests')->json('quests'))->firstWhere('area', 'input');

        $this->postJson("/api/daily-quests/{$input['id']}/change", ['key' => 'listen_podcast'])->assertOk();
        $this->postJson("/api/daily-quests/{$input['id']}/change", ['key' => 'read_story'])->assertOk();
        $this->postJson("/api/daily-quests/{$input['id']}/change", ['key' => 'read_article'])
            ->assertStatus(422)
            ->assertJsonPath('message', "You've already changed this quest twice today.");

        // Re-picking what is already showing is free, not a wasted change.
        $second = User::factory()->create();
        Sanctum::actingAs($second);
        $q = collect($this->getJson('/api/daily-quests')->json('quests'))->firstWhere('area', 'vocabulary');
        $this->postJson("/api/daily-quests/{$q['id']}/change", ['key' => $q['key']])
            ->assertOk()
            ->assertJsonPath('quest.changes_left', 2);
    }

    public function test_the_target_moves_between_three_named_levels_only(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);
        $vocab = collect($this->getJson('/api/daily-quests')->json('quests'))->firstWhere('area', 'vocabulary');

        $this->putJson("/api/daily-quests/{$vocab['id']}/target", ['level' => 'hard'])
            ->assertOk()
            ->assertJsonPath('quest.level', 'hard')
            ->assertJsonPath('quest.target', 20);

        $this->putJson("/api/daily-quests/{$vocab['id']}/target", ['level' => 'easy'])
            ->assertOk()
            ->assertJsonPath('quest.target', 5)
            ->assertJsonPath('quest.label', 'Review 5 words');

        // No typing your own number in.
        $this->putJson("/api/daily-quests/{$vocab['id']}/target", ['level' => 1])->assertStatus(422);
        $this->putJson("/api/daily-quests/{$vocab['id']}/target", ['level' => 'trivial'])->assertStatus(422);
    }

    public function test_only_your_own_quest_and_only_todays(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        Sanctum::actingAs($other);
        $theirs = collect($this->getJson('/api/daily-quests')->json('quests'))->first();

        Sanctum::actingAs($me);
        $this->postJson("/api/daily-quests/{$theirs['id']}/change", ['key' => 'read_story'])->assertForbidden();

        $old = DailyQuest::create([
            'user_id' => $me->id, 'day' => Carbon::yesterday()->toDateString(),
            'area' => 'input', 'quest_key' => 'read_article', 'level' => 'normal',
        ]);
        $this->putJson("/api/daily-quests/{$old->id}/target", ['level' => 'easy'])->assertNotFound();
    }

    public function test_the_dashboard_card_carries_the_quests(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);
        StudyLevel::forceCreate(['user_id' => $me->id, 'title' => 'HSK 1', 'category' => 'hsk']);

        $this->getJson('/api/learning-plan')
            ->assertOk()
            ->assertJsonCount(3, 'quests')
            ->assertJsonStructure(['quests' => [['id', 'area', 'key', 'label', 'target', 'progress', 'done', 'level', 'why', 'changes_left']]]);
    }
}
