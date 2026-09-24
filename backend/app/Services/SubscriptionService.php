<?php

namespace App\Services;

use App\Models\Subscription;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

class SubscriptionService
{
    public const ACCESS_STATUSES = ['active', 'trialing', 'past_due'];

    public function configured(): bool
    {
        return PaymentService::configured() && filled(config('services.stripe.pro_price_id'));
    }

    public function price(): ?array
    {
        if (!$this->configured()) return null;
        try {
            $p = PaymentService::client()->prices->retrieve(config('services.stripe.pro_price_id'));
            $expected = config('services.stripe.pro_price_id');
            $amount = (int) ($p->unit_amount ?? 0);
            $recurring = $p->recurring ?? null;
            if (($p->id ?? null) !== $expected || ($p->active ?? false) !== true || ($p->type ?? null) !== 'recurring'
                || !$recurring || ($recurring->interval ?? null) !== 'month' || (int) ($recurring->interval_count ?? 0) !== 1
                || ($p->currency ?? null) !== config('services.stripe.currency', 'usd') || $amount < 1) return null;
            $configuredAmount = config('services.stripe.pro_monthly_amount');
            if (filled($configuredAmount) && $amount !== (int) $configuredAmount) return null;
            return ['id' => $p->id, 'amount' => $amount, 'currency' => $p->currency,
                'monthly_display' => strtoupper($p->currency) === 'USD' ? '$'.number_format($amount / 100, 2).' / month' : number_format($amount / 100, 2).' '.strtoupper($p->currency).' / month'];
        } catch (\Throwable $e) { Log::warning('Unable to validate Pro price', ['error' => $e->getMessage()]); return null; }
    }

    public function status(User $user): array
    {
        $s = $user->subscription;
        return ['plan' => $user->is_admin ? 'admin' : (($s && $s->grantsAccess()) ? 'pro' : 'free'),
            'is_pro' => (bool) ($user->is_admin || ($s && $s->grantsAccess())),
            'status' => $s?->status, 'current_period_end' => $s?->current_period_end?->toIso8601String(),
            'current_period_start' => $s?->current_period_start?->toIso8601String(), 'cancel_at_period_end' => (bool) ($s?->cancel_at_period_end),
            'cancel_at' => $s?->cancel_at?->toIso8601String(), 'canceled_at' => $s?->canceled_at?->toIso8601String(),
            'renewal_date' => $s?->current_period_end?->toIso8601String(), 'manage_available' => filled($user->stripe_customer_id),
            'price' => $this->price()];
    }

    /** How the checkout is shown. The browser may choose this and nothing else. */
    public const CHECKOUT_UIS = ['hosted', 'elements'];

    /**
     * Start a Pro subscription checkout — the ONE entry point for every place
     * that sells Pro (the upgrade page, the in-app checkout, any future
     * promotion). The price is always the configured, validated recurring Pro
     * price; nothing about price or amount is read from the request.
     *
     * `hosted` returns a redirect URL; `elements` returns a client secret for
     * Verbo's own checkout page (payment fields rendered inside our UI).
     * Neither grants Pro: access is only ever written by the verified webhook.
     */
    public function checkout(User $user, string $ui = 'hosted'): array
    {
        abort_unless(in_array($ui, self::CHECKOUT_UIS, true), 422, 'Unknown checkout type.');
        $price = $this->price(); abort_unless($price, 422, 'The Pro monthly price is not configured.');
        abort_if($user->subscription?->grantsAccess(), 409, 'This account already has Pro.');
        $customer = $this->customer($user);
        $meta = ['purpose' => 'verbo_pro', 'user_id' => (string) $user->id, 'stripe_customer_id' => $customer];
        $front = rtrim(config('services.stripe.frontend_url'), '/');
        $params = ['mode' => 'subscription', 'customer' => $customer,
            'client_reference_id' => (string) $user->id, 'metadata' => $meta, 'subscription_data' => ['metadata' => $meta],
            'line_items' => [['price' => $price['id'], 'quantity' => 1]],
            // Cards only. (Brand blocking is not accepted for embedded
            // sessions; limit brands with a Radar rule in the dashboard.)
            'payment_method_types' => ['card']];
        $params += $ui === 'elements'
            ? ['ui_mode' => 'elements', 'return_url' => $front.'/upgrade/success?session_id={CHECKOUT_SESSION_ID}']
            : ['success_url' => $front.'/upgrade/success?session_id={CHECKOUT_SESSION_ID}', 'cancel_url' => $front.'/upgrade'];
        try {
            $session = PaymentService::client()->checkout->sessions->create($params);
        } catch (\Stripe\Exception\ApiErrorException $e) {
            // The provider's message names parameters and internals; log it
            // for the operator and give the page a plain sentence.
            Log::error('Pro checkout could not start', ['error' => $e->getMessage(), 'user' => $user->id]);
            abort(503, 'Checkout could not be started. Please try again in a moment.');
        }
        return $ui === 'elements'
            ? ['client_secret' => $session->client_secret, 'id' => $session->id, 'price' => $price]
            : ['url' => $session->url, 'id' => $session->id];
    }

    public function portal(User $user): array
    {
        abort_unless(filled($user->stripe_customer_id), 422, 'No billing account is connected yet.');
        $s = PaymentService::client()->billingPortal->sessions->create(['customer' => $user->stripe_customer_id,
            'return_url' => rtrim(config('services.stripe.frontend_url'), '/').'/upgrade']);
        return ['url' => $s->url];
    }

    public function sync(object $stripe, ?User $user = null): ?Subscription
    {
        $customer = (string) ($stripe->customer ?? ''); $priceId = data_get($stripe, 'items.data.0.price.id');
        $price = $this->price();
        if (!$price || $priceId !== $price['id']) { Log::warning('Ignored subscription with unexpected Pro price', ['subscription' => $stripe->id ?? null]); return null; }
        $user ??= User::where('stripe_customer_id', $customer)->first();
        $metaUser = data_get($stripe, 'metadata.user_id');
        if (!$user && $metaUser) $user = User::find((int) $metaUser);
        abort_unless($user && (!$user->stripe_customer_id || $user->stripe_customer_id === $customer), 422, 'Subscription owner could not be verified.');
        if (!$user->stripe_customer_id) $user->update(['stripe_customer_id' => $customer]);
        $s = Subscription::updateOrCreate(['stripe_subscription_id' => $stripe->id], ['user_id' => $user->id, 'stripe_customer_id' => $customer,
            'stripe_price_id' => $priceId, 'status' => (string) $stripe->status, 'current_period_start' => $this->date($stripe->current_period_start ?? null),
            'current_period_end' => $this->date($stripe->current_period_end ?? null), 'cancel_at_period_end' => (bool) ($stripe->cancel_at_period_end ?? false),
            'cancel_at' => $this->date($stripe->cancel_at ?? null), 'canceled_at' => $this->date($stripe->canceled_at ?? null), 'trial_end' => $this->date($stripe->trial_end ?? null)]);
        $user->update(['is_pro' => $s->grantsAccess()]); return $s;
    }

    private function customer(User $user): string
    {
        if ($user->stripe_customer_id) return $user->stripe_customer_id;
        $c = PaymentService::client()->customers->create(['email' => $user->email, 'name' => $user->name, 'metadata' => ['user_id' => (string) $user->id]]);
        $user->update(['stripe_customer_id' => $c->id]); return $c->id;
    }
    private function date($value): ?Carbon { return $value ? Carbon::createFromTimestamp((int) $value) : null; }
}
