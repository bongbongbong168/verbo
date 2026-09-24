<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PremiumArticleAccessTest extends TestCase
{
    use RefreshDatabase;

    private function premiumArticle(User $author)
    {
        return $author->articles()->create([
            'title' => 'A premium story',
            'type' => 'story',
            'body' => str_repeat('这是一个值得慢慢阅读的故事。', 30),
            'body_en' => 'This complete translation must not be exposed.',
            'is_premium' => true,
        ]);
    }

    public function test_free_reader_receives_only_a_preview(): void
    {
        $article = $this->premiumArticle(User::factory()->create());
        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson('/api/articles/'.$article->id)->assertOk();

        $this->assertTrue($response->json('premium_locked'));
        $this->assertLessThan(mb_strlen($article->body), mb_strlen($response->json('body')));
        $response->assertJsonPath('body_en', null);
    }

    public function test_pro_reader_receives_the_complete_article(): void
    {
        $article = $this->premiumArticle(User::factory()->create());
        Sanctum::actingAs(User::factory()->create(['is_pro' => true]));

        $this->getJson('/api/articles/'.$article->id)
            ->assertOk()
            ->assertJsonPath('premium_locked', false)
            ->assertJsonPath('body', $article->body)
            ->assertJsonPath('body_en', $article->body_en);
    }

    public function test_admin_receives_the_complete_article_for_editing(): void
    {
        $article = $this->premiumArticle(User::factory()->create());
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));

        $this->getJson('/api/articles/'.$article->id)
            ->assertOk()
            ->assertJsonPath('premium_locked', false)
            ->assertJsonPath('body', $article->body);
    }

    public function test_free_reader_cannot_bypass_the_gate_through_translation(): void
    {
        $article = $this->premiumArticle(User::factory()->create());
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/articles/'.$article->id.'/translation')
            ->assertForbidden();
    }
}
