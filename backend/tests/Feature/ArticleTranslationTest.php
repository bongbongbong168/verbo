<?php

namespace Tests\Feature;

use App\Models\User;
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

        for ($i = 0; $i < 2; $i++) {
            $this->postJson('/api/articles/'.$article->id.'/translation')
                ->assertOk()
                ->assertJsonPath('pairs.0.translation', 'Hello.')
                ->assertJsonPath('pairs.1.translation', 'How are you?');
        }

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['text'] === ['你好。', '你好吗？']
            && $request['source_lang'] === 'ZH'
            && $request['target_lang'] === 'EN-US'
            && $request->hasHeader('Authorization', 'DeepL-Auth-Key test-key'));
    }
}
