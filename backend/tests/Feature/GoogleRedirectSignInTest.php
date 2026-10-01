<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\GoogleAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The full-page Google sign-in used where the popup cannot work (in-app browsers). */
class GoogleRedirectSignInTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.google.client_id' => 'test-client', 'services.google.frontend_url' => 'https://site.test']);
    }

    private function fakeGoogle(?array $claims): void
    {
        $mock = $this->createMock(GoogleAuthService::class);
        $mock->method('verify')->willReturn($claims);
        $this->app->instance(GoogleAuthService::class, $mock);
    }

    public function test_redirect_returns_a_one_time_code_that_signs_in_once(): void
    {
        $this->fakeGoogle(['sub' => 'g-1', 'email' => 'a@b.test', 'name' => 'Ann']);

        $res = $this->post('/api/auth/google/redirect', ['credential' => 'tok']);
        $res->assertRedirect();
        $location = $res->headers->get('Location');
        $this->assertStringStartsWith('https://site.test/auth/google#code=', $location);
        // The session token itself is never put in a URL.
        $this->assertStringNotContainsString('|', $location);

        $code = explode('#code=', $location)[1];
        $this->postJson('/api/auth/google/exchange', ['code' => $code])
            ->assertOk()->assertJsonPath('user.email', 'a@b.test')->assertJsonStructure(['token']);

        $this->postJson('/api/auth/google/exchange', ['code' => $code])->assertStatus(401);
        $this->assertSame('g-1', User::where('email', 'a@b.test')->value('google_id'));
    }

    public function test_a_bad_credential_goes_back_to_login_not_a_500(): void
    {
        $this->fakeGoogle(null);

        $this->post('/api/auth/google/redirect', ['credential' => 'bad'])
            ->assertRedirect('https://site.test/login?google_error=unverified');
    }
}
