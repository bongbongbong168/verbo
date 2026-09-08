<?php

namespace Tests\Feature;

use App\Rules\NoUnsafeLinks;
use App\Services\SafeBrowsingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SafeBrowsingTest extends TestCase
{
    use RefreshDatabase;

    private function service(): SafeBrowsingService
    {
        config(['services.safe_browsing.key' => 'test-key']);

        return new SafeBrowsingService;
    }

    /** The extractor has to survive real message bodies, which are mostly CJK. */
    public function test_it_finds_urls_without_swallowing_chinese(): void
    {
        $svc = $this->service();

        $this->assertSame(
            ['http://example.com/lesson'],
            $svc->extractUrls('你好！请看 http://example.com/lesson 谢谢')
        );

        // A bare domain is still a link someone can copy.
        $this->assertSame(['http://verbo.app'], $svc->extractUrls('go to verbo.app'));

        // www with no scheme.
        $this->assertSame(['http://www.verbo.app'], $svc->extractUrls('see www.verbo.app'));

        // Sentence punctuation is not part of the URL.
        $this->assertSame(['http://example.com'], $svc->extractUrls('try example.com.'));
        $this->assertSame(['http://example.com'], $svc->extractUrls('(example.com)'));

        // Plain Chinese with no link at all must produce nothing — if the
        // character classes leak into CJK this returns the sentence.
        $this->assertSame([], $svc->extractUrls('我们明天上课，好吗？'));

        // Duplicates collapse, so one paste is one lookup.
        $this->assertCount(1, $svc->extractUrls('a.com and a.com again'));
    }

    public function test_it_flags_a_url_google_reports_as_a_threat(): void
    {
        Http::fake([
            'safebrowsing.googleapis.com/*' => Http::response([
                'matches' => [[
                    'threatType' => 'SOCIAL_ENGINEERING',
                    'threat' => ['url' => 'http://bad.example/login'],
                    'cacheDuration' => '300s',
                ]],
            ]),
        ]);

        $threat = $this->service()->firstThreatInText('sign in here: http://bad.example/login');

        $this->assertNotNull($threat);
        $this->assertSame('SOCIAL_ENGINEERING', $threat['threat']);
        $this->assertStringContainsString('phishing', SafeBrowsingService::describe($threat['threat']));
    }

    public function test_a_clean_url_passes_and_is_cached(): void
    {
        Http::fake(['safebrowsing.googleapis.com/*' => Http::response([])]);

        $svc = $this->service();
        $this->assertNull($svc->firstThreatInText('see http://good.example'));

        // Second look is answered from cache, so no second request is made.
        $this->assertNull($svc->firstThreatInText('see http://good.example'));
        Http::assertSentCount(1);
    }

    /**
     * The most important behaviour here. If Google is unreachable, users must
     * still be able to talk to each other.
     */
    public function test_it_fails_open_when_the_api_errors(): void
    {
        Http::fake(['safebrowsing.googleapis.com/*' => Http::response('nope', 503)]);

        $this->assertNull($this->service()->firstThreatInText('http://whatever.example'));
    }

    public function test_it_fails_open_when_the_request_throws(): void
    {
        Http::fake(fn () => throw new \RuntimeException('connection timed out'));

        $this->assertNull($this->service()->firstThreatInText('http://whatever.example'));
    }

    /** An install with no key must behave exactly as before the feature existed. */
    public function test_it_is_inert_without_a_key(): void
    {
        config(['services.safe_browsing.key' => null]);
        Http::fake();

        $this->assertFalse(SafeBrowsingService::configured());
        $this->assertNull((new SafeBrowsingService)->firstThreatInText('http://bad.example'));
        Http::assertNothingSent();
    }

    /**
     * Guards the one failure this design cannot otherwise detect.
     *
     * Because the service fails OPEN, a malformed request body would be
     * answered with a 400, logged, and allowed through — protection would be
     * silently off with nothing visibly broken. Asserting the shape Google
     * documents is what turns that into a failing test instead.
     */
    public function test_it_sends_the_request_shape_google_documents(): void
    {
        Http::fake(['safebrowsing.googleapis.com/*' => Http::response([])]);
        Cache::flush();

        $this->service()->firstThreatInText('look at http://example.com/a');

        Http::assertSent(function ($request) {
            $body = $request->data();

            $this->assertStringStartsWith(
                'https://safebrowsing.googleapis.com/v4/threatMatches:find',
                $request->url()
            );
            $this->assertStringContainsString('key=test-key', $request->url());

            $this->assertSame(['clientId', 'clientVersion'], array_keys($body['client']));
            $this->assertSame(
                ['threatTypes', 'platformTypes', 'threatEntryTypes', 'threatEntries'],
                array_keys($body['threatInfo'])
            );
            $this->assertContains('SOCIAL_ENGINEERING', $body['threatInfo']['threatTypes']);
            $this->assertSame(['ANY_PLATFORM'], $body['threatInfo']['platformTypes']);
            $this->assertSame(['URL'], $body['threatInfo']['threatEntryTypes']);
            // A LIST of {url: ...} objects, not a list of bare strings.
            $this->assertSame([['url' => 'http://example.com/a']], $body['threatInfo']['threatEntries']);

            return true;
        });
    }

    public function test_the_validation_rule_rejects_and_explains(): void
    {
        Http::fake([
            'safebrowsing.googleapis.com/*' => Http::response([
                'matches' => [[
                    'threatType' => 'MALWARE',
                    'threat' => ['url' => 'http://bad.example'],
                    'cacheDuration' => '300s',
                ]],
            ]),
        ]);
        config(['services.safe_browsing.key' => 'test-key']);
        Cache::flush();

        $rule = new NoUnsafeLinks;
        $this->assertFalse($rule->passes('body', 'take a look http://bad.example'));
        $this->assertStringContainsString('malware', $rule->message());

        $ok = new NoUnsafeLinks;
        $this->assertTrue($ok->passes('body', '我们明天上课，好吗？'));
    }
}
