<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class RateLimitKeyTest extends TestCase
{
    use RefreshDatabase;

    /*
     * The api limiter runs BEFORE auth:sanctum, so it must resolve the token
     * itself. Keyed on the IP, every visitor behind Railway's proxy shared one
     * 300/min bucket and the whole site returned "Too many requests".
     */
    public function test_the_api_limit_is_keyed_on_the_token_user_not_the_ip(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('t')->plainTextToken;

        $request = Request::create('/api/user', 'GET', server: [
            'HTTP_AUTHORIZATION' => 'Bearer '.$token,
            'REMOTE_ADDR' => '10.0.0.1',
        ]);
        $this->app->instance('request', $request);

        $limit = RateLimiter::limiter('api')($request);

        $this->assertSame((string) $user->id, (string) $limit->key);
    }
}
