<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Tests\TestCase;

/**
 * The in-app Pro checkout. Stripe is faked at the HTTP layer, so these assert
 * exactly what Verbo sends: the configured recurring price and nothing from
 * the browser, subscription mode, and no Pro granted by starting a checkout.
 */
class SubscriptionCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private FakeStripeHttp $http;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.stripe.key' => 'pk_test_x',
            'services.stripe.secret' => 'sk_test_x',
            'services.stripe.pro_price_id' => 'price_pro',
            'services.stripe.pro_monthly_amount' => 699,
            'services.stripe.currency' => 'usd',
            'services.stripe.frontend_url' => 'https://verbo.test',
        ]);
        $this->http = new FakeStripeHttp();
        ApiRequestor::setHttpClient($this->http);
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient(null);
        parent::tearDown();
    }

    public function test_elements_checkout_uses_the_configured_price_and_returns_a_client_secret(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/subscription/checkout', [
            'ui' => 'elements',
            // Anything the browser adds about price or amount must be ignored.
            'price' => 'price_attacker',
            'amount' => 1,
        ])->assertOk()
            ->assertJsonPath('client_secret', 'cs_secret_123')
            ->assertJsonPath('price.amount', 699)
            ->assertJsonMissingPath('url');

        $session = $this->http->last('/v1/checkout/sessions');
        $this->assertSame('subscription', $session['mode']);
        $this->assertSame('elements', $session['ui_mode']);
        $this->assertSame('price_pro', $session['line_items'][0]['price']);
        $this->assertStringStartsWith('https://verbo.test/upgrade/success', $session['return_url']);
        $this->assertArrayNotHasKey('success_url', $session);
        $this->assertSame(['card'], $session['payment_method_types']);
        $this->assertSame(['american_express', 'discover_global_network'],
            $session['payment_method_options']['card']['restrictions']['brands_blocked']);

        // Starting a checkout grants nothing; only the webhook does.
        $this->assertFalse((bool) $user->fresh()->is_pro);
        $this->getJson('/api/subscription/status')->assertJsonPath('is_pro', false);
    }

    public function test_hosted_checkout_is_still_the_default(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/subscription/checkout')->assertOk()
            ->assertJsonPath('url', 'https://checkout.example/session');

        $session = $this->http->last('/v1/checkout/sessions');
        $this->assertArrayNotHasKey('ui_mode', $session);
        $this->assertSame('https://verbo.test/upgrade', $session['cancel_url']);
    }

    public function test_an_unknown_checkout_type_is_refused(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/subscription/checkout', ['ui' => 'anything'])->assertStatus(422);
        $this->assertNull($this->http->last('/v1/checkout/sessions'));
    }
}

/** Answers Stripe's API with fixed objects and records what was sent. */
class FakeStripeHttp implements ClientInterface
{
    public array $calls = [];

    public function request($method, $absUrl, $headers, $params, $hasFile, $apiMode = 'v1', $maxNetworkRetries = null)
    {
        $path = parse_url($absUrl, PHP_URL_PATH);
        $this->calls[] = [$path, $params];

        $body = match (true) {
            str_starts_with($path, '/v1/prices/') => ['id' => 'price_pro', 'object' => 'price', 'active' => true,
                'type' => 'recurring', 'currency' => 'usd', 'unit_amount' => 699,
                'recurring' => ['interval' => 'month', 'interval_count' => 1]],
            $path === '/v1/customers' => ['id' => 'cus_123', 'object' => 'customer'],
            $path === '/v1/checkout/sessions' => ['id' => 'cs_123', 'object' => 'checkout.session',
                'client_secret' => ($params['ui_mode'] ?? null) === 'elements' ? 'cs_secret_123' : null,
                'url' => ($params['ui_mode'] ?? null) === 'elements' ? null : 'https://checkout.example/session'],
            default => ['error' => ['message' => 'unexpected '.$path]],
        };

        return [json_encode($body), isset($body['error']) ? 400 : 200, []];
    }

    public function last(string $path): ?array
    {
        foreach (array_reverse($this->calls) as [$p, $params]) {
            if ($p === $path) return $params;
        }

        return null;
    }
}
