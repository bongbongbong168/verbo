<?php

namespace Tests\Feature;

use App\Models\EmailCode;
use App\Models\User;
use App\Notifications\EmailCodeNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
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

    public function test_registering_sends_a_verification_code()
    {
        Notification::fake();

        $this->postJson('/api/register', [
            'name' => 'Mei',
            'email' => 'mei@example.test',
            'password' => 'a-real-password',
        ])->assertStatus(201);

        $user = User::where('email', 'mei@example.test')->first();
        Notification::assertSentTo($user, EmailCodeNotification::class,
            fn ($n) => $n->purpose === EmailCode::VERIFY);
    }

    /**
     * REGISTRATION MUST SUCCEED EVEN WITH NO MAILER.
     *
     * Verifying is a nag, not a gate. If a dead mailer could fail sign-up,
     * one outage would stop anybody joining at all — and this app has no
     * queue to retry the send with, so the failure would be permanent.
     */
    public function test_registration_still_succeeds_when_mail_is_dead()
    {
        config(['mail.default' => 'log']);

        $response = $this->postJson('/api/register', [
            'name' => 'Mei',
            'email' => 'mei@example.test',
            'password' => 'a-real-password',
        ]);

        $response->assertStatus(201)->assertJsonStructure(['user', 'token']);
        $this->assertNotNull($response->json('token'));
    }

    /** A new account is unverified until the code is entered. */
    public function test_a_new_account_starts_unverified()
    {
        Notification::fake();

        $this->postJson('/api/register', [
            'name' => 'Mei',
            'email' => 'mei@example.test',
            'password' => 'a-real-password',
        ])->assertStatus(201);

        $this->assertNull(User::where('email', 'mei@example.test')->first()->email_verified_at);
    }

    public function test_the_right_code_confirms_the_address()
    {
        $user = $this->learner();
        $code = EmailCode::issue($user->email, EmailCode::VERIFY);

        $this->actingAs($user)
            ->postJson('/api/email/verify', ['code' => $code])
            ->assertOk();

        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_a_wrong_code_does_not_confirm()
    {
        $user = $this->learner();
        $code = EmailCode::issue($user->email, EmailCode::VERIFY);

        $this->actingAs($user)
            ->postJson('/api/email/verify', ['code' => $code === '000000' ? '111111' : '000000'])
            ->assertStatus(422);

        $this->assertNull($user->fresh()->email_verified_at);
    }

    /** A reset code must not be spendable on verification either. */
    public function test_a_reset_code_cannot_confirm_an_address()
    {
        $user = $this->learner();
        $code = EmailCode::issue($user->email, EmailCode::RESET);

        $this->actingAs($user)
            ->postJson('/api/email/verify', ['code' => $code])
            ->assertStatus(422);

        $this->assertNull($user->fresh()->email_verified_at);
    }

    /**
     * ONE PERSON'S CODE MUST NOT VERIFY ANOTHER PERSON'S ACCOUNT.
     *
     * The address is read off the session, so a code minted for someone else
     * is simply looked up against the caller's own email and misses.
     */
    public function test_someone_elses_code_does_not_work()
    {
        $user = $this->learner();
        $other = $this->learner('someone.else@example.test');
        $code = EmailCode::issue($other->email, EmailCode::VERIFY);

        $this->actingAs($user)
            ->postJson('/api/email/verify', ['code' => $code])
            ->assertStatus(422);

        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_resending_sends_a_fresh_code()
    {
        Notification::fake();
        $user = $this->learner();

        $this->actingAs($user)->postJson('/api/email/send-code')->assertOk();

        Notification::assertSentTo($user, EmailCodeNotification::class,
            fn ($n) => $n->purpose === EmailCode::VERIFY);
    }

    public function test_an_already_verified_account_is_told_so_rather_than_mailed()
    {
        Notification::fake();
        $user = $this->learner();
        $user->forceFill(['email_verified_at' => now()])->save();

        $this->actingAs($user)->postJson('/api/email/send-code')
            ->assertOk()
            ->assertJson(['verified' => true]);

        Notification::assertNothingSent();
    }

    public function test_both_routes_are_behind_auth()
    {
        $this->postJson('/api/email/send-code')->assertStatus(401);
        $this->postJson('/api/email/verify', ['code' => '123456'])->assertStatus(401);
    }

    public function test_it_reports_cleanly_when_the_server_cannot_send_mail()
    {
        config(['mail.default' => 'log']);
        $user = $this->learner();

        $this->actingAs($user)->postJson('/api/email/send-code')->assertStatus(503);
    }
}
