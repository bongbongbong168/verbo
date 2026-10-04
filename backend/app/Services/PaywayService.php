<?php

namespace App\Services;

use App\Models\PaywayTransaction;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * ABA PayWay - the Cambodian gateway (ABA KHQR, cards).
 *
 * Two calls, both signed with the merchant's API key, which never leaves the
 * server:
 *  - PURCHASE: the browser is sent to ABA's hosted checkout with fields this
 *    class builds and signs. The amount comes from our own records, never the
 *    request, so nobody can name their own price.
 *  - CHECK TRANSACTION: the only thing ever believed about whether money
 *    arrived. ABA's callback and the student's return to the page are both
 *    just prompts to ASK; neither can confirm an order on its own say-so.
 *
 * Formats follow ABA's PayWay developer docs (payment-gateway/v1): hash is
 * base64(HMAC-SHA512(concatenated fields, api_key)), field order fixed, and
 * req_time is UTC YYYYMMDDHHmmss. A wrong order yields a valid-looking hash
 * that PayWay rejects, so the order lives in ONE place: PURCHASE_HASH_ORDER.
 */
class PaywayService
{
    private const SANDBOX = 'https://checkout-sandbox.payway.com.kh';
    private const LIVE = 'https://checkout.payway.com.kh';

    /** ABA's documented concatenation order for the purchase hash. */
    public const PURCHASE_HASH_ORDER = [
        'req_time', 'merchant_id', 'tran_id', 'amount', 'items', 'shipping',
        'firstname', 'lastname', 'email', 'phone', 'type', 'payment_option',
        'return_url', 'cancel_url', 'continue_success_url', 'return_deeplink',
        'currency', 'custom_fields', 'return_params', 'payout', 'lifetime',
        'additional_params', 'google_pay_token', 'skip_success_page',
    ];

    /** payment_status_code values from check-transaction. */
    public const APPROVED = 0;

    /**
     * The price of one month of Pro, in cents: the same monthly price the
     * Stripe plan charges, so KHQR and card can never disagree. Read from
     * STRIPE_PRO_MONTHLY_AMOUNT, else from the Stripe price itself.
     */
    public static function proMonthCents(): ?int
    {
        $configured = config('services.stripe.pro_monthly_amount');
        if (filled($configured) && (int) $configured > 0) {
            return (int) $configured;
        }
        $price = app(SubscriptionService::class)->price();

        return $price['amount'] ?? null;
    }

    public static function configured(): bool
    {
        return filled(config('services.payway.merchant_id')) && filled(config('services.payway.api_key'));
    }

    public static function baseUrl(): string
    {
        return filter_var(config('services.payway.sandbox'), FILTER_VALIDATE_BOOLEAN) ? self::SANDBOX : self::LIVE;
    }

    public static function purchaseUrl(): string
    {
        return self::baseUrl().'/api/payment-gateway/v1/payments/purchase';
    }

    public static function hash(string $data): string
    {
        return base64_encode(hash_hmac('sha512', $data, (string) config('services.payway.api_key'), true));
    }

    /**
     * Start (or reuse) a PayWay checkout and return the signed form fields
     * the browser posts to ABA.
     *
     * A still-pending transaction for the same purchase is NOT reused: every
     * checkout gets a fresh tran_id, because ABA refuses a repeated one.
     */
    public static function startCheckout(Model $payable, $user, string $returnPath): array
    {
        // A User as the payable means "one month of Verbo Pro".
        $amount = $payable instanceof \App\Models\User
            ? self::proMonthCents()
            : PaymentService::priceOf($payable);
        abort_if($amount === null, 422, 'There is nothing to pay for here.');

        // <= 20 chars, letters and digits only, unique.
        $tranId = 'VB'.now()->format('ymdHis').strtoupper(Str::random(6));

        $tx = PaywayTransaction::create([
            'user_id' => $user->id,
            'payable_type' => get_class($payable),
            'payable_id' => $payable->getKey(),
            'tran_id' => $tranId,
            'amount' => $amount,
            'currency' => config('services.payway.currency', 'USD'),
        ]);

        $frontend = rtrim((string) config('services.stripe.frontend_url'), '/');
        $name = trim((string) $user->name);
        $first = Str::before($name, ' ') ?: $name;
        $last = Str::contains($name, ' ') ? Str::after($name, ' ') : '';
        $title = match (true) {
            $payable instanceof \App\Models\User => 'Verbo Pro - 1 month',
            $payable instanceof \App\Models\Booking => optional($payable->lesson)->name ?: 'Lesson',
            default => optional($payable->course)->title ?: 'Course',
        };

        $fields = [
            'req_time' => now('UTC')->format('YmdHis'),
            'merchant_id' => (string) config('services.payway.merchant_id'),
            'tran_id' => $tranId,
            'amount' => number_format($amount / 100, 2, '.', ''),
            'items' => base64_encode(json_encode([[
                'name' => Str::limit($title, 60, ''),
                'quantity' => 1,
                'price' => number_format($amount / 100, 2, '.', ''),
            ]])),
            'firstname' => $first,
            'lastname' => $last,
            'email' => (string) $user->email,
            'type' => 'purchase',
            // KHQR: ABA returns the QR as JSON for us to show inline.
            'payment_option' => 'abapay_khqr',
            // ABA's server-to-server "paid" ping, base64 as the docs require.
            'return_url' => base64_encode(url('/api/payway/callback')),
            'cancel_url' => $frontend.$returnPath,
            'continue_success_url' => $frontend.$returnPath.(str_contains($returnPath, '?') ? '&' : '?').'payway='.$tranId,
            'currency' => $tx->currency,
        ];

        $hashSource = '';
        foreach (self::PURCHASE_HASH_ORDER as $key) {
            $hashSource .= $fields[$key] ?? '';
        }
        $fields['hash'] = self::hash($hashSource);

        /* Asked from the SERVER, not by sending the browser to ABA: for KHQR,
           ABA answers with JSON (the QR as text and as a PNG, plus the app
           deeplink), which the checkout card shows inline. Sent to the
           browser, that same JSON just rendered as raw text. */
        try {
            $response = Http::asMultipart()->acceptJson()->timeout(20)->post(self::purchaseUrl(), $fields);
        } catch (\Throwable $e) {
            Log::warning('PayWay purchase unreachable', ['tran_id' => $tranId, 'error' => $e->getMessage()]);
            abort(503, 'ABA PayWay could not be reached. Please try again.');
        }

        $json = $response->json() ?? [];
        if ((string) data_get($json, 'status.code') !== '00' || ! data_get($json, 'qrImage')) {
            Log::warning('PayWay purchase refused', ['tran_id' => $tranId, 'body' => mb_substr($response->body(), 0, 500)]);
            abort(502, 'ABA PayWay could not start this payment. Please try again.');
        }

        return [
            'tran_id' => $tranId,
            'qr_image' => data_get($json, 'qrImage'),     // data:image/png;base64,...
            'qr_string' => data_get($json, 'qrString'),
            'deeplink' => data_get($json, 'abapay_deeplink'),
            'amount' => $fields['amount'],
            'currency' => $fields['currency'],
        ];
    }

    /**
     * Ask ABA what happened to a transaction. Returns ABA's `data` block, or
     * null when ABA could not be asked (no answer is not the same as unpaid).
     */
    public static function check(string $tranId): ?array
    {
        $reqTime = now('UTC')->format('YmdHis');
        $merchant = (string) config('services.payway.merchant_id');

        try {
            $response = Http::acceptJson()->timeout(15)->post(
                self::baseUrl().'/api/payment-gateway/v1/payments/check-transaction-2',
                [
                    'req_time' => $reqTime,
                    'merchant_id' => $merchant,
                    'tran_id' => $tranId,
                    'hash' => self::hash($reqTime.$merchant.$tranId),
                ]
            );
        } catch (\Throwable $e) {
            Log::warning('PayWay check-transaction unreachable', ['tran_id' => $tranId, 'error' => $e->getMessage()]);

            return null;
        }

        if (! $response->successful() || (string) data_get($response->json(), 'status.code') !== '00') {
            Log::warning('PayWay check-transaction refused', ['tran_id' => $tranId, 'body' => $response->body()]);

            return null;
        }

        return (array) data_get($response->json(), 'data', []);
    }

    /**
     * Verify with ABA and, if approved for the right amount, fulfil.
     * Idempotent: a transaction already paid is returned as it is.
     */
    public static function reconcile(PaywayTransaction $tx): PaywayTransaction
    {
        if ($tx->status === PaywayTransaction::STATUS_PAID) {
            return $tx;
        }

        $data = self::check($tx->tran_id);
        if ($data === null) {
            return $tx;
        }

        $code = (int) ($data['payment_status_code'] ?? -1);
        $paidCents = PaymentService::toMinorUnit($data['payment_amount'] ?? $data['total_amount'] ?? 0);

        if ($code === self::APPROVED) {
            // Paid, but not what we asked for: never hand the order over.
            if ($paidCents < $tx->amount) {
                Log::error('PayWay approved a short payment', ['tran_id' => $tx->tran_id, 'paid' => $paidCents, 'due' => $tx->amount]);

                return $tx;
            }

            $tx->update([
                'status' => PaywayTransaction::STATUS_PAID,
                'apv' => $data['apv'] ?? null,
                'paid_at' => now(),
            ]);

            $payable = $tx->payable;
            if ($payable instanceof \App\Models\User) {
                // One month of Pro, added to any time still left - paying
                // early never throws away days already bought.
                $from = $payable->pro_until && $payable->pro_until->isFuture() ? $payable->pro_until : now();
                $payable->forceFill(['pro_until' => $from->copy()->addMonth()])->save();
            } else {
                \App\Http\Controllers\Api\PaymentController::settlePayable($payable);
            }
        } elseif (in_array($code, [3, 7], true)) { // declined, cancelled
            $tx->update(['status' => PaywayTransaction::STATUS_FAILED]);
        }

        return $tx->fresh();
    }
}
