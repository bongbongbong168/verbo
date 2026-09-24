<?php

namespace Tests\Feature;

use App\Models\MonthlyFeatureUsage;
use App\Models\User;
use App\Services\UsageAllowanceService;
use App\Services\OcrService;
use App\Services\DictionaryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UsageAllowanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_free_pro_and_admin_limits_are_centralized(): void
    {
        $service = app(UsageAllowanceService::class);
        $free = User::factory()->create();
        $pro = User::factory()->create(['is_pro' => true]);
        $admin = User::factory()->create(['is_admin' => true]);

        $this->assertSame(5, $service->summary($free, UsageAllowanceService::SCANS)['limit']);
        $this->assertSame(10, $service->summary($free, UsageAllowanceService::TRANSLATIONS)['limit']);
        $this->assertSame(100, $service->summary($pro, UsageAllowanceService::SCANS)['limit']);
        $this->assertSame(300, $service->summary($pro, UsageAllowanceService::TRANSLATIONS)['limit']);
        $this->assertNull($service->summary($admin, UsageAllowanceService::SCANS)['limit']);
        $this->assertTrue($service->summary($admin, UsageAllowanceService::TRANSLATIONS)['available']);
    }

    public function test_usage_is_per_user_and_resets_with_the_calendar_month(): void
    {
        Carbon::setTestNow('2026-09-30 10:00:00');
        $service = app(UsageAllowanceService::class);
        $first = User::factory()->create();
        $second = User::factory()->create();

        $reservation = $service->reserve($first, UsageAllowanceService::SCANS);
        $service->commit($first, UsageAllowanceService::SCANS, $reservation);

        $this->assertSame(1, $service->summary($first, UsageAllowanceService::SCANS)['used']);
        $this->assertSame(0, $service->summary($second, UsageAllowanceService::SCANS)['used']);

        Carbon::setTestNow('2026-10-01 00:01:00');
        $this->assertSame(0, $service->summary($first, UsageAllowanceService::SCANS)['used']);
        $this->assertSame('2026-11-01', $service->summary($first, UsageAllowanceService::SCANS)['reset_date']);
        Carbon::setTestNow();
    }

    public function test_reservations_prevent_repeated_requests_from_exceeding_the_limit(): void
    {
        $service = app(UsageAllowanceService::class);
        $user = User::factory()->create();
        MonthlyFeatureUsage::create([
            'user_id' => $user->id,
            'feature' => UsageAllowanceService::TRANSLATIONS,
            'period_start' => now()->startOfMonth()->toDateString(),
            'used' => 9,
        ]);

        $reservation = $service->reserve($user, UsageAllowanceService::TRANSLATIONS);
        try {
            $service->reserve($user, UsageAllowanceService::TRANSLATIONS);
            $this->fail('A second request should not fit while the final slot is reserved.');
        } catch (HttpResponseException $e) {
            $this->assertSame(429, $e->getResponse()->getStatusCode());
            $this->assertSame('usage_limit_reached', json_decode($e->getResponse()->getContent(), true)['code']);
        }

        $service->commit($user, UsageAllowanceService::TRANSLATIONS, $reservation);
        $this->assertSame(10, $service->summary($user, UsageAllowanceService::TRANSLATIONS)['used']);
    }

    public function test_success_counts_once_cache_is_free_and_provider_failure_does_not_count(): void
    {
        $author = User::factory()->create();
        $article = $author->articles()->create([
            'title' => 'Allowance article',
            'type' => 'article',
            'body' => '你好。',
        ]);
        $learner = User::factory()->create();
        Sanctum::actingAs($learner);
        config(['services.deepl.key' => 'test-key']);
        $key = 'article-translation:v1:'.$article->id.':'.hash('sha256', $article->body);
        Cache::forget($key);

        Http::fake(['api-free.deepl.com/*' => Http::sequence()
            ->push(['message' => 'provider failed'], 456)
            ->push(['translations' => [['text' => 'Hello.']]])]);

        $this->postJson('/api/articles/'.$article->id.'/translation')->assertStatus(503);
        $this->assertDatabaseMissing('monthly_feature_usages', ['user_id' => $learner->id, 'used' => 1]);
        Cache::forget('translation-provider:deepl-unavailable');

        $this->postJson('/api/articles/'.$article->id.'/translation')
            ->assertOk()
            ->assertJsonPath('usage.used', 1)
            ->assertJsonPath('usage.remaining', 9);
        $this->postJson('/api/articles/'.$article->id.'/translation')
            ->assertOk()
            ->assertJsonPath('usage.used', 1);
        Http::assertSentCount(2);
    }

    public function test_only_a_successfully_created_scan_consumes_allowance(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=');

        $ocr = $this->mock(OcrService::class);
        $ocr->shouldReceive('extractChineseText')->once()->andReturn('你好。');
        $dictionary = $this->mock(DictionaryService::class);
        $dictionary->shouldReceive('segment')->once()->andReturn(['你好']);
        $dictionary->shouldReceive('pinyinFor')->once()->andReturn('nǐ hǎo');
        $dictionary->shouldReceive('lookup')->once()->andReturn('hello');

        $this->post('/api/scans', [
            'image' => UploadedFile::fake()->createWithContent('success.png', $png),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('usage.used', 1);

        $ocr->shouldReceive('extractChineseText')->once()->andThrow(new \RuntimeException('OCR unavailable'));
        $this->post('/api/scans', [
            'image' => UploadedFile::fake()->createWithContent('failed.png', $png),
        ], ['Accept' => 'application/json'])->assertStatus(500);

        $this->assertSame(1, app(UsageAllowanceService::class)
            ->summary($user, UsageAllowanceService::SCANS)['used']);
        $this->assertDatabaseHas('monthly_feature_usages', [
            'user_id' => $user->id, 'feature' => UsageAllowanceService::SCANS, 'reserved' => 0,
        ]);
    }

    public function test_limit_error_is_structured_and_allowance_endpoint_has_both_features(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        MonthlyFeatureUsage::create([
            'user_id' => $user->id,
            'feature' => UsageAllowanceService::TRANSLATIONS,
            'period_start' => now()->startOfMonth()->toDateString(),
            'used' => 10,
        ]);
        $article = User::factory()->create()->articles()->create([
            'title' => 'Limited article', 'type' => 'article', 'body' => '你好。',
        ]);

        $this->postJson('/api/articles/'.$article->id.'/translation')
            ->assertStatus(429)
            ->assertJsonPath('code', 'usage_limit_reached')
            ->assertJsonPath('usage.available', false)
            ->assertJsonPath('usage.remaining', 0);

        $this->getJson('/api/usage/allowances')
            ->assertOk()
            ->assertJsonPath('usage.scans.limit', 5)
            ->assertJsonPath('usage.full_text_translations.used', 10);
    }
}
