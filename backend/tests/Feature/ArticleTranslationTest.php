<?php

namespace Tests\Feature;

use App\Models\MonthlyFeatureUsage;
use App\Models\User;
use App\Services\UsageAllowanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ArticleTranslationTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_learner_can_translate_an_article_by_sentence_and_reuse_the_cache(): void
    {
        $author = User::factory()->create();
        $article = $author->articles()->create([
            'title' => 'Test article',
            'type' => 'article',
            'body' => '你好。你好吗？',
        ]);
        Sanctum::actingAs(User::factory()->create());
        config(['services.deepl.key' => 'test-key']);
        Cache::forget('article-translation:v1:'.$article->id.':'.hash('sha256', $article->body));
        Http::fake([
            'api-free.deepl.com/*' => Http::response([
                'translations' => [['text' => 'Hello.'], ['text' => 'How are you?']],
            ]),
        ]);

        $this->postJson('/api/articles/'.$article->id.'/translation')
            ->assertOk()
            ->assertJsonPath('pairs.0.translation', 'Hello.')
            ->assertJsonPath('pairs.1.translation', 'How are you?')
            ->assertJsonPath('usage.used', 1)
            ->assertJsonPath('usage.remaining', 9);

        $this->postJson('/api/articles/'.$article->id.'/translation')
            ->assertOk()
            ->assertJsonPath('usage.used', 1)
            ->assertJsonPath('usage.remaining', 9);

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['text'] === ['你好。', '你好吗？']
            && $request['source_lang'] === 'ZH'
            && $request['target_lang'] === 'EN-US'
            && $request->hasHeader('Authorization', 'DeepL-Auth-Key test-key'));
    }

    public function test_cached_translation_remains_available_at_zero_and_a_new_one_is_blocked(): void
    {
        $author = User::factory()->create();
        $cachedArticle = $author->articles()->create([
            'title' => 'Cached article',
            'type' => 'article',
            'body' => '你好。',
        ]);
        $newArticle = $author->articles()->create([
            'title' => 'New article',
            'type' => 'article',
            'body' => '谢谢。',
        ]);
        $learner = User::factory()->create();
        Sanctum::actingAs($learner);
        config(['services.deepl.key' => 'test-key']);
        Http::fake(['api-free.deepl.com/*' => Http::response([
            'translations' => [['text' => 'Hello.']],
        ])]);

        $this->postJson('/api/articles/'.$cachedArticle->id.'/translation')
            ->assertOk()
            ->assertJsonPath('usage.used', 1);

        MonthlyFeatureUsage::query()
            ->where('user_id', $learner->id)
            ->where('feature', UsageAllowanceService::TRANSLATIONS)
            ->update(['used' => 10]);

        $this->postJson('/api/articles/'.$cachedArticle->id.'/translation')
            ->assertOk()
            ->assertJsonPath('usage.remaining', 0)
            ->assertJsonPath('pairs.0.translation', 'Hello.');

        $this->postJson('/api/articles/'.$newArticle->id.'/translation')
            ->assertStatus(429)
            ->assertJsonPath('code', 'usage_limit_reached')
            ->assertJsonPath('usage.remaining', 0);

        Http::assertSentCount(1);
    }
}
