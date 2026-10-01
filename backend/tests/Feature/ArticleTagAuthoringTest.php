<?php

namespace Tests\Feature;

use App\Models\Article;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Admin-picked tags are checked against the preference lists; style and difficulty are derived. */
class ArticleTagAuthoringTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $u = User::factory()->create();
        $u->forceFill(['is_admin' => true])->save();
        Sanctum::actingAs($u);

        return $u;
    }

    public function test_tags_are_saved_with_derived_style_and_difficulty(): void
    {
        $this->admin();

        $res = $this->post('/api/articles', [
            'title' => 'T', 'type' => 'story', 'body' => '你好', 'hsk_level' => 'HSK 3',
            'tags' => [['kind' => 'focus', 'value' => 'Grammar'], ['kind' => 'interest', 'value' => 'Daily Life']],
        ], ['Accept' => 'application/json'])->assertCreated();

        $a = Article::with('tags')->find($res->json('id'));
        $this->assertSame('Intermediate', $a->difficulty);
        $pairs = $a->tags->map(fn ($t) => $t->kind.'|'.$t->value)->sort()->values()->all();
        $this->assertSame(['focus|Grammar', 'interest|Daily Life', 'style|Stories'], $pairs);
    }

    public function test_description_is_saved_and_capped_in_words(): void
    {
        $this->admin();
        $base = ['title' => 'T', 'type' => 'article', 'body' => '你好'];

        $this->postJson('/api/articles', $base + ['summary' => 'A short line about tea.'])
            ->assertCreated()->assertJsonPath('summary', 'A short line about tea.');

        $this->postJson('/api/articles', $base + ['summary' => str_repeat('word ', 51)])
            ->assertStatus(422)->assertJsonValidationErrors('summary');
    }

    public function test_a_tag_outside_the_preference_lists_is_refused(): void
    {
        $this->admin();

        $this->postJson('/api/articles', [
            'title' => 'T', 'type' => 'article', 'body' => '你好',
            'tags' => [['kind' => 'interest', 'value' => 'grammar stuff']],
        ])->assertStatus(422);
    }

    public function test_tags_present_with_no_tags_clears_hand_picked_ones(): void
    {
        $admin = $this->admin();
        $a = $admin->articles()->create(['title' => 'T', 'type' => 'article', 'body' => '你好']);
        $a->tags()->create(['kind' => 'focus', 'value' => 'Grammar']);

        $this->post("/api/articles/{$a->id}", [
            '_method' => 'PUT', 'title' => 'T', 'type' => 'article', 'body' => '你好', 'tags_present' => '1',
        ], ['Accept' => 'application/json'])->assertOk();

        $this->assertSame(['style|Articles'], $a->tags()->get()->map(fn ($t) => $t->kind.'|'.$t->value)->all());
    }
}
