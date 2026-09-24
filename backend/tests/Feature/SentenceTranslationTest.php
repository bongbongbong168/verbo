<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SentenceTranslationTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_learner_can_translate_a_sentence_and_reuse_the_cached_result(): void
    {
        Sanctum::actingAs(User::factory()->create());
        config(['services.deepl.key' => 'test-key']);
        Cache::forget('sentence-translation:v1:'.hash('sha256', '吃健康的食物'));
        Http::fake([
            'api-free.deepl.com/*' => Http::response([
                'translations' => [['text' => 'Eat healthy food']],
            ]),
        ]);

        for ($i = 0; $i < 2; $i++) {
            $this->postJson('/api/sentences/translate', ['text' => '吃健康的食物'])
                ->assertOk()
                ->assertJson(['translation' => 'Eat healthy food']);
        }

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['text'] === ['吃健康的食物']
            && $request['source_lang'] === 'ZH'
            && $request['target_lang'] === 'EN-US'
            && $request->hasHeader('Authorization', 'DeepL-Auth-Key test-key'));
    }
}
