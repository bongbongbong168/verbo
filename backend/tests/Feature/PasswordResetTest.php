<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // `log` and `array` deliberately do not count as a working mailer, so
        // every test that expects delivery has to name a real-looking one.
        config(['mail.default' => 'smtp']);
    }

    private function learner(string $email = 'mei@example.test'): User
    {
        return User::create([
            'name' => 'Mei',
            'email' => $email,
            'password' => bcrypt('the-old-one'),
        ]);
    }

    public function test_it_sends_a_link_to_a_real_account()
    {
        Notification::fake();
        $user = $this->learner();

        $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();

        Notification::assertSentTo($user, ResetPassword::class);
    }

    /**
     * THE ANSWER IS IDENTICAL FOR AN UNKNOWN ADDRESS.
     *
     * Saying "no account with that email" would turn this into a way to test
     * which addresses out of a list have Verbo accounts.
     */
    public function test_an_unknown_address_gets_the_same_answer_and_no_mail()
    {
        Notification::fake();
        $this->learner();

        $known = $this->postJson('/api/forgot-password', ['email' => 'mei@example.test']);
        $unknown = $this->postJson('/api/forgot-password', ['email' => 'nobody@example.test']);

        $this->assertSame($known->status(), $unknown->status());
        $this->assertSame($known->json('message'), $unknown->json('message'));
        Notification::assertCount(1);
    }

    /** The link has to land on the React app, not on this API. */
    public function test_the_link_points_at_the_frontend_with_the_email_attached()
    {
        Notification::fake();
        config(['app.frontend_url' => 'https://verbo-omega.vercel.app']);
        $user = $this->learner();

        $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();

        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use ($user) {
            $url = $notification->toMail($user)->actionUrl;

            return str_starts_with($url, 'https://verbo-omega.vercel.app/reset-password/')
                && str_contains($url, 'email=' . urlencode($user->email));
        });
    }

    public function test_a_valid_token_changes_the_password()
    {
        Notification::fake();
        $user = $this->learner();
        $this->postJson('/api/forgot-password', ['email' => $user->email]);

        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($n) use (&$token) {
            $token = $n->token;

            return true;
        });

        $this->postJson('/api/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ])->assertOk();

        $this->assertTrue(Hash::check('a-brand-new-one', $user->fresh()->password));
    }

    /**
     * EVERY EXISTING SESSION DIES WITH THE RESET.
     *
     * Someone resetting a password has usually lost control of it. Leaving
     * old tokens alive would mean the new password changes nothing for
     * whoever already had a session.
     */
    public function test_resetting_revokes_every_existing_token()
    {
        Notification::fake();
        $user = $this->learner();
        $user->createToken('phone');
        $user->createToken('laptop');
        $this->assertSame(2, $user->tokens()->count());

        $this->postJson('/api/forgot-password', ['email' => $user->email]);
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($n) use (&$token) {
            $token = $n->token;

            return true;
        });

        $this->postJson('/api/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ])->assertOk();

        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_a_token_cannot_be_used_twice()
    {
        Notification::fake();
        $user = $this->learner();
        $this->postJson('/api/forgot-password', ['email' => $user->email]);
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($n) use (&$token) {
            $token = $n->token;

            return true;
        });

        $body = [
            'token' => $token,
            'email' => $user->email,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ];

        $this->postJson('/api/reset-password', $body)->assertOk();
        $this->postJson('/api/reset-password', $body)->assertStatus(422);
    }

    public function test_a_forged_token_is_refused()
    {
        $user = $this->learner();

        $this->postJson('/api/reset-password', [
            'token' => 'not-a-real-token',
            'email' => $user->email,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ])->assertStatus(422);

        $this->assertTrue(Hash::check('the-old-one', $user->fresh()->password));
    }

    public function test_a_weak_password_is_refused()
    {
        $this->postJson('/api/reset-password', [
            'token' => 'whatever',
            'email' => 'mei@example.test',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    /**
     * A checkout with no mailer says so plainly rather than 500ing from deep
     * inside the mail transport — the same courtesy Stripe, Safe Browsing and
     * Gemini get.
     */
    public function test_it_reports_cleanly_when_the_server_cannot_send_mail()
    {
        config(['mail.default' => 'log']);
        $this->learner();

        $this->postJson('/api/forgot-password', ['email' => 'mei@example.test'])
            ->assertStatus(503);
    }

    /**
     * A CONFIGURED-BUT-UNREACHABLE MAILER MUST NOT REACH THE USER.
     *
     * `canSendMail()` only sees the driver name, so a real `smtp` setting
     * pointed at a host that is not there sails past it and throws from inside
     * the transport. That message carries the mail host, the port and PHP's
     * socket internals — observed in the UI as `Connection could not be
     * established with host "mailpit:1025": stream_socket_client :
     * php_network_getaddresses…`. Same rule as OCR: log it, answer plainly.
     */
    public function test_a_failing_mail_transport_is_not_leaked_to_the_client()
    {
        $this->learner();
        Notification::shouldReceive('send')
            ->andThrow(new \RuntimeException('Connection could not be established with host "mailpit:1025"'));

        $response = $this->postJson('/api/forgot-password', ['email' => 'mei@example.test']);

        $response->assertStatus(503);
        $this->assertStringNotContainsString('mailpit', $response->getContent());
        $this->assertStringNotContainsString('stream_socket_client', $response->getContent());
    }

    /** The signed-in route, for Settings. */
    public function test_a_signed_in_user_can_send_a_link_to_themselves()
    {
        Notification::fake();
        $user = $this->learner();

        $this->actingAs($user)->postJson('/api/user/password/reset-link')->assertOk();

        Notification::assertSentTo($user, ResetPassword::class);
    }

    /**
     * The address comes from the session, never the request, so this cannot
     * be pointed at somebody else's account.
     */
    public function test_the_signed_in_route_ignores_any_email_in_the_body()
    {
        Notification::fake();
        $user = $this->learner();
        $other = $this->learner('someone.else@example.test');

        $this->actingAs($user)
            ->postJson('/api/user/password/reset-link', ['email' => $other->email])
            ->assertOk();

        Notification::assertSentTo($user, ResetPassword::class);
        Notification::assertNotSentTo($other, ResetPassword::class);
    }

    public function test_the_signed_in_route_is_behind_auth()
    {
        $this->postJson('/api/user/password/reset-link')->assertStatus(401);
    }
}
