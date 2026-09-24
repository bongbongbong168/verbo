<?php

namespace Tests\Feature;

use App\Services\ChineseTranslationService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ChineseTranslationServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::forget('translation-provider:deepl-unavailable');
        config([
            'services.deepl.key' => 'deepl-test-key',
            'services.gemini.key' => 'gemini-test-key',
            'services.gemini.model' => 'gemini-test',
        ]);
    }

    public function test_deepl_is_used_when_it_is_available(): void
    {
        Http::fake([
            'https://api-free.deepl.com/*' => Http::response(['translations' => [['text' => 'Hello']]]),
        ]);

        $this->assertSame(['Hello'], app(ChineseTranslationService::class)->translate(['你好']));
        Http::assertSentCount(1);
    }

    public function test_gemini_takes_over_when_deepl_cannot_connect(): void
    {
        Http::fake([
            'https://api-free.deepl.com/*' => function () {
                throw new \Illuminate\Http\Client\ConnectionException('DeepL connection failed');
            },
            'https://generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [['content' => ['parts' => [['text' => '{"translations":["Hello","Thank you"]}']]]]],
            ]),
        ]);

        $this->assertSame(
            ['Hello', 'Thank you'],
            app(ChineseTranslationService::class)->translate(['你好', '谢谢'])
        );
        Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://generativelanguage.googleapis.com/'));
    }
}
