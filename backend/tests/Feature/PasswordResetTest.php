<?php

namespace Tests\Feature;

use App\Models\EmailCode;
use App\Models\User;
use App\Notifications\EmailCodeNotification;
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

    /** Ask for a code and read it back out of the notification. */
    private function codeFor(User $user): string
    {
        $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();

        $code = null;
        Notification::assertSentTo($user, EmailCodeNotification::class, function ($n) use (&$code) {
            $code = $n->code;

            return true;
        });

        return $code;
    }

    public function test_it_sends_a_code_to_a_real_account()
    {
        Notification::fake();
        $user = $this->learner();

        $this->postJson('/api/forgot-password', ['email' => $user->email])->assertOk();

        Notification::assertSentTo($user, EmailCodeNotification::class,
            fn ($n) => $n->purpose === EmailCode::RESET && preg_match('/^\d{6}$/', $n->code) === 1);
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

    /** THE CODE ITSELF MUST NEVER COME BACK IN THE RESPONSE. */
    public function test_the_code_is_not_in_the_response_body()
    {
        Notification::fake();
        $user = $this->learner();

        $response = $this->postJson('/api/forgot-password', ['email' => $user->email]);

        $code = null;
        Notification::assertSentTo($user, EmailCodeNotification::class, function ($n) use (&$code) {
            $code = $n->code;

            return true;
        });

        $this->assertStringNotContainsString($code, $response->getContent());
    }

    /** Stored hashed, like any other credential. */
    public function test_the_code_is_hashed_at_rest()
    {
        Notification::fake();
        $user = $this->learner();
        $code = $this->codeFor($user);

        $row = EmailCode::where('email', $user->email)->latest('id')->first();

        $this->assertNotSame($code, $row->code_hash);
        $this->assertTrue(Hash::check($code, $row->code_hash));
    }

    public function test_a_valid_code_changes_the_password()
    {
        Notification::fake();
        $user = $this->learner();
        $code = $this->codeFor($user);

        $this->postJson('/api/reset-password', [
            'email' => $user->email,
            'code' => $code,
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

        $code = $this->codeFor($user);

        $this->postJson('/api/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ])->assertOk();

        $this->assertSame(0, $user->tokens()->count());
    }

    /** Receiving a code at that address proves the address. */
    public function test_resetting_also_confirms_the_email()
    {
        Notification::fake();
        $user = $this->learner();
        $this->assertNull($user->email_verified_at);

        $code = $this->codeFor($user);

        $this->postJson('/api/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ])->assertOk();

        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_a_code_cannot_be_used_twice()
    {
        Notification::fake();
        $user = $this->learner();
        $code = $this->codeFor($user);

        $body = [
            'email' => $user->email,
            'code' => $code,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ];

        $this->postJson('/api/reset-password', $body)->assertOk();
        $this->postJson('/api/reset-password', $body)->assertStatus(422);
    }

    /** Asking again must not leave the previous code live. */
    public function test_issuing_a_new_code_kills_the_previous_one()
    {
        Notification::fake();
        $user = $this->learner();

        $first = $this->codeFor($user);
        Notification::fake();
        $second = $this->codeFor($user);
        $this->assertNotSame($first, $second);

        $this->postJson('/api/reset-password', [
            'email' => $user->email,
            'code' => $first,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ])->assertStatus(422);

        $this->assertTrue(Hash::check('the-old-one', $user->fresh()->password));
    }

    /**
     * THE ATTEMPT CAP IS WHAT MAKES SIX DIGITS SAFE.
     *
     * Without it a million possibilities is a weekend's work. After five
     * wrong guesses the code is dead, so even the RIGHT one stops working
     * and the attacker has to request another — which lands in the victim's
     * inbox and is its own alarm.
     */
    public function test_the_code_dies_after_five_wrong_guesses()
    {
        Notification::fake();
        $user = $this->learner();
        $code = $this->codeFor($user);

        for ($i = 0; $i < EmailCode::MAX_ATTEMPTS; $i++) {
            $this->postJson('/api/reset-password', [
                'email' => $user->email,
                'code' => '000000' === $code ? '111111' : '000000',
                'password' => 'a-brand-new-one',
                'password_confirmation' => 'a-brand-new-one',
            ])->assertStatus(422);
        }

        // Even the real code is now refused.
        $this->postJson('/api/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ])->assertStatus(422);

        $this->assertTrue(Hash::check('the-old-one', $user->fresh()->password));
    }

    public function test_an_expired_code_is_refused()
    {
        Notification::fake();
        $user = $this->learner();
        $code = $this->codeFor($user);

        $this->travel(EmailCode::TTL_MINUTES + 1)->minutes();

        $this->postJson('/api/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ])->assertStatus(422);

        $this->assertTrue(Hash::check('the-old-one', $user->fresh()->password));
    }

    /** A code issued to confirm an address must not reset a password. */
    public function test_a_verification_code_cannot_be_spent_on_a_reset()
    {
        $user = $this->learner();
        $code = EmailCode::issue($user->email, EmailCode::VERIFY);

        $this->postJson('/api/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'a-brand-new-one',
            'password_confirmation' => 'a-brand-new-one',
        ])->assertStatus(422);

        $this->assertTrue(Hash::check('the-old-one', $user->fresh()->password));
    }

    public function test_a_weak_password_is_refused()
    {
        $this->postJson('/api/reset-password', [
            'email' => 'mei@example.test',
            'code' => '123456',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

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
     * `configured()` only sees the driver name, so a real `smtp` setting
     * pointed at a host that is not there throws from inside the transport.
     * That message carries the mail host, the port and PHP's socket
     * internals — observed in the UI as `Connection could not be established
     * with host "mailpit:1025": stream_socket_client …`.
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
    public function test_a_signed_in_user_can_send_a_code_to_themselves()
    {
        Notification::fake();
        $user = $this->learner();

        $this->actingAs($user)->postJson('/api/user/password/reset-link')->assertOk();

        Notification::assertSentTo($user, EmailCodeNotification::class);
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

        Notification::assertSentTo($user, EmailCodeNotification::class);
        Notification::assertNotSentTo($other, EmailCodeNotification::class);
    }

    public function test_the_signed_in_route_is_behind_auth()
    {
        $this->postJson('/api/user/password/reset-link')->assertStatus(401);
    }
}
