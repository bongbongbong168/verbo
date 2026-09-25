<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PodcastTranslationTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_admin_can_translate_a_manual_chinese_transcript(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        config(['services.deepl.key' => 'test-key']);
        Http::fake(['api-free.deepl.com/*' => Http::response(['translations' => [['text' => 'Hello.'], ['text' => 'How are you?']]])]);
        $this->postJson('/api/podcasts/translate', ['text' => '大家好。你好吗？'])
            ->assertOk()
            ->assertJsonPath('translation', "Hello.\nHow are you?")
            ->assertJsonPath('translations.0', 'Hello.')
            ->assertJsonPath('translations.1', 'How are you?');
        Http::assertSent(fn ($request) => $request['text'] === ['大家好。', '你好吗？']
            && $request->hasHeader('Authorization', 'DeepL-Auth-Key test-key'));
    }

    public function test_a_listener_cannot_spend_the_translation_allowance(): void
    {
        Sanctum::actingAs(User::factory()->create());
        Http::fake();
        $this->postJson('/api/podcasts/translate', ['text' => '大家好。'])->assertForbidden();
        Http::assertNothingSent();
    }
}
