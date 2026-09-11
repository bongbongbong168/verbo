<?php

namespace Tests\Feature;

use App\Models\EmailCode;
use App\Models\User;
use App\Services\EmailCodeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The Brevo HTTP transport.
 *
 * Worth testing rather than trusting, because its failure mode is quiet: a
 * payload Brevo does not like comes back as a 400 that this app catches and
 * turns into "we could not send the email just now". Mail would be broken in
 * production with nothing visibly wrong in the code — the same reason
 * SafeBrowsingService has a test asserting its exact request shape.
 */
class BrevoTransportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'mail.default' => 'brevo',
            'mail.from.address' => 'verbo@example.test',
            'mail.from.name' => 'Verbo',
            'services.brevo.key' => 'test-key-abc123',
            'services.brevo.timeout' => 10,
        ]);
    }

    private function learner(): User
    {
        return User::create([
            'name' => 'Mei',
            'email' => 'mei@example.test',
            'password' => bcrypt('the-old-one'),
        ]);
    }

    public function test_it_posts_the_shape_brevo_documents()
    {
        Http::fake(['api.brevo.com/*' => Http::response(['messageId' => '<abc@brevo>'], 201)]);

        Mail::raw('the body', fn ($m) => $m->to('mei@example.test', 'Mei')->subject('Hello'));

        Http::assertSent(function (Request $request) {
            $b = $request->data();

            return $request->url() === 'https://api.brevo.com/v3/smtp/email'
                && $request->method() === 'POST'
                && $b['sender']['email'] === 'verbo@example.test'
                && $b['to'][0]['email'] === 'mei@example.test'
                && $b['to'][0]['name'] === 'Mei'
                && $b['subject'] === 'Hello'
                && str_contains($b['textContent'], 'the body');
        });
    }

    /** THE KEY IS A HEADER, NEVER THE URL — a URL reaches logs and proxies. */
    public function test_the_api_key_travels_as_a_header_and_not_in_the_url()
    {
        Http::fake(['api.brevo.com/*' => Http::response(['messageId' => 'x'], 201)]);

        Mail::raw('body', fn ($m) => $m->to('mei@example.test')->subject('s'));

        Http::assertSent(function (Request $request) {
            return $request->hasHeader('api-key', 'test-key-abc123')
                && ! str_contains($request->url(), 'test-key-abc123');
        });
    }

    /** A real code send must carry both the HTML and the plain-text part. */
    public function test_a_verification_code_goes_out_with_both_bodies()
    {
        Http::fake(['api.brevo.com/*' => Http::response(['messageId' => 'x'], 201)]);
        $user = $this->learner();

        $this->assertTrue(EmailCodeService::send($user, EmailCode::VERIFY));

        Http::assertSent(function (Request $request) {
            $b = $request->data();

            return ! empty($b['htmlContent'])
                && ! empty($b['textContent'])
                && preg_match('/\d{6}/', $b['subject']) === 1;
        });
    }

    /** THE CODE MUST NOT BE RETURNED TO THE CALLER, only mailed. */
    public function test_the_code_reaches_brevo_but_never_the_caller()
    {
        Http::fake(['api.brevo.com/*' => Http::response(['messageId' => 'x'], 201)]);
        $user = $this->learner();

        $response = $this->postJson('/api/forgot-password', ['email' => $user->email]);

        $sentCode = null;
        Http::assertSent(function (Request $request) use (&$sentCode) {
            preg_match('/\d{6}/', $request->data()['subject'], $m);
            $sentCode = $m[0] ?? null;

            return true;
        });

        $this->assertNotNull($sentCode);
        $this->assertStringNotContainsString($sentCode, $response->getContent());
    }

    /**
     * A refusal is logged and answered plainly — never handed to the user,
     * which is the rule ScanController follows for the tesseract command line.
     */
    public function test_a_brevo_refusal_is_reported_cleanly()
    {
        Http::fake(['api.brevo.com/*' => Http::response(
            ['code' => 'unauthorized', 'message' => 'Key not found'], 401
        )]);
        Log::spy();
        $this->learner();

        $response = $this->postJson('/api/forgot-password', ['email' => 'mei@example.test']);

        $response->assertStatus(503);
        $this->assertStringNotContainsString('unauthorized', $response->getContent());
        $this->assertStringNotContainsString('Key not found', $response->getContent());
        Log::shouldHaveReceived('error')->once();
    }

    /** A hung provider must not hang a sign-up. */
    public function test_a_connection_failure_is_reported_cleanly()
    {
        Http::fake(fn () => throw new \Illuminate\Http\Client\ConnectionException('cURL error 28: timed out'));
        $this->learner();

        $this->postJson('/api/forgot-password', ['email' => 'mei@example.test'])
            ->assertStatus(503);
    }

    /**
     * `brevo` selected with no key cannot deliver, and the caller should be
     * told that rather than invited to retry something that will never work.
     */
    public function test_brevo_without_a_key_counts_as_unconfigured()
    {
        config(['services.brevo.key' => null]);

        $this->assertFalse(EmailCodeService::configured());

        $this->learner();
        $this->postJson('/api/forgot-password', ['email' => 'mei@example.test'])
            ->assertStatus(503)
            ->assertJsonFragment(['message' => 'This server cannot send email yet, so a reset code cannot be delivered. Ask an administrator to reset your password.']);
    }
}
