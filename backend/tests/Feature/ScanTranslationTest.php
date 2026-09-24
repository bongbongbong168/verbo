<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ScanTranslationTest extends TestCase
{
    use RefreshDatabase;

    private function scan()
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        return $user->scans()->create(['original_filename' => 'test.png', 'raw_text' => '你好。你好吗？', 'words' => []]);
    }

    public function test_translates_full_passage_and_reuses_cache()
    {
        $scan = $this->scan();
        config(['services.deepl.key' => 'test-key']);
        Http::fake(['api-free.deepl.com/*' => Http::response(['translations' => [['text' => 'Hello.'], ['text' => 'How are you?']]])]);
        for ($i = 0; $i < 2; $i++) {
            $this->postJson('/api/scans/'.$scan->id.'/translation')->assertOk()->assertJsonPath('pairs.0.translation', 'Hello.')->assertJsonPath('pairs.1.translation', 'How are you?');
        }
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['text'] === ['你好。', '你好吗？']
            && $request['source_lang'] === 'ZH' && $request['target_lang'] === 'EN-US'
            && $request->hasHeader('Authorization', 'DeepL-Auth-Key test-key'));
    }

    public function test_other_users_cannot_translate_a_scan()
    {
        $scan = $this->scan();
        Sanctum::actingAs(User::factory()->create());
        Http::fake();
        $this->postJson('/api/scans/'.$scan->id.'/translation')->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_missing_key_does_not_call_provider()
    {
        $scan = $this->scan();
        config(['services.deepl.key' => null, 'services.gemini.key' => null]);
        Cache::forget('translation-provider:deepl-unavailable');
        Http::fake();
        $this->postJson('/api/scans/'.$scan->id.'/translation')->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_provider_errors_are_safe_and_not_cached()
    {
        $scan = $this->scan();
        config(['services.deepl.key' => 'secret-test-key']);
        Http::fake(['api-free.deepl.com/*' => Http::sequence()->push(['message' => 'secret-test-key'], 456)->push(['translations' => [['text' => 'Hello.'], ['text' => 'How are you?']]])]);
        $this->postJson('/api/scans/'.$scan->id.'/translation')->assertStatus(503)->assertDontSee('secret-test-key');
        Cache::forget('translation-provider:deepl-unavailable');
        $this->postJson('/api/scans/'.$scan->id.'/translation')->assertOk();
    }
}
