<?php

namespace Tests\Feature;

use App\Services\GeminiOcrService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Scan's Gemini reader.
 *
 * Every test fakes HTTP, so nothing reaches Google and the suite needs no key.
 * The contract under test is the one OcrService relies on: text on success,
 * and NULL - never an exception - whenever Gemini cannot be used, so the scan
 * falls back to Tesseract.
 */
class GeminiOcrTest extends TestCase
{
    private string $image;

    protected function setUp(): void
    {
        parent::setUp();
        // A real 1x1 PNG, so mime detection and base64 run on actual bytes.
        $this->image = tempnam(sys_get_temp_dir(), 'ocr').'.png';
        file_put_contents($this->image, base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII='
        ));
    }

    protected function tearDown(): void
    {
        @unlink($this->image);
        parent::tearDown();
    }

    private function withKey(): void
    {
        config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'gemini-test']);
    }

    private function fake(array $body, int $status = 200): void
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response($body, $status)]);
    }

    public function test_it_returns_the_transcribed_text(): void
    {
        $this->withKey();
        $this->fake(['candidates' => [[
            'finishReason' => 'STOP',
            'content' => ['parts' => [['text' => "你好\n欢迎光临"]]],
        ]]]);

        $this->assertSame("你好\n欢迎光临", app(GeminiOcrService::class)->extract($this->image));
    }

    public function test_it_sends_the_image_inline_and_the_key_in_a_header(): void
    {
        $this->withKey();
        $this->fake(['candidates' => [['finishReason' => 'STOP', 'content' => ['parts' => [['text' => '字']]]]]]);

        app(GeminiOcrService::class)->extract($this->image);

        Http::assertSent(function (Request $request) {
            $inline = data_get($request->data(), 'contents.0.parts.1.inline_data');

            return $request->hasHeader('x-goog-api-key', 'test-key')
                && ! str_contains($request->url(), 'key=')
                && $inline['mime_type'] === 'image/png'
                && base64_decode($inline['data']) === file_get_contents($this->image);
        });
    }

    public function test_a_code_fence_the_model_adds_is_stripped(): void
    {
        $this->withKey();
        $this->fake(['candidates' => [[
            'finishReason' => 'STOP',
            'content' => ['parts' => [['text' => "```\n北京  \n上海\n```"]]],
        ]]]);

        $this->assertSame("北京\n上海", app(GeminiOcrService::class)->extract($this->image));
    }

    public function test_a_blank_image_is_an_empty_string_not_a_fallback(): void
    {
        $this->withKey();
        $this->fake(['candidates' => [['finishReason' => 'STOP', 'content' => ['parts' => [['text' => '']]]]]]);

        $this->assertSame('', app(GeminiOcrService::class)->extract($this->image));
    }

    public function test_no_key_falls_back_without_calling_google(): void
    {
        config(['services.gemini.key' => null]);
        Http::fake();

        $this->assertNull(app(GeminiOcrService::class)->extract($this->image));
        Http::assertNothingSent();
    }

    public function test_an_upstream_error_falls_back(): void
    {
        $this->withKey();
        $this->fake(['error' => ['message' => 'quota']], 429);

        $this->assertNull(app(GeminiOcrService::class)->extract($this->image));
    }

    public function test_a_safety_block_falls_back_rather_than_saving_an_empty_scan(): void
    {
        $this->withKey();
        $this->fake(['candidates' => [['finishReason' => 'SAFETY']]]);

        $this->assertNull(app(GeminiOcrService::class)->extract($this->image));
    }

    public function test_a_network_failure_falls_back(): void
    {
        $this->withKey();
        Http::fake(fn () => throw new \Illuminate\Http\Client\ConnectionException('timed out'));

        $this->assertNull(app(GeminiOcrService::class)->extract($this->image));
    }
}
