<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\CourseEnrollment;
use App\Models\Payment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Stripe\StripeClient;

/**
 * Everything that knows about Stripe.
 *
 * Kept in one class on purpose: controllers should never construct a
 * StripeClient or reason about cents, and there must be exactly one place that
 * decides what a thing costs. The amount ALWAYS comes from the lesson or course
 * on the server — never from the request — or a client could name its own price.
 */
class PaymentService
{
    /**
     * What may be paid for. A whitelist, not a free-form morph map: the type
     * arrives from the client, so without this a caller could point a payment
     * at any model in the app. Same rule as RecentViewController::TYPES and
     * FlashcardController::SOURCES.
     */
    public const PAYABLES = [
        'lesson' => Booking::class,
        'course' => CourseEnrollment::class,
    ];

    /**
     * Is Stripe wired in at all?
     *
     * A fresh checkout has no keys, and the app must stay usable — the checkout
     * page falls back to its demo button rather than erroring. Every entry
     * point checks this first.
     */
    public static function configured(): bool
    {
        return filled(config('services.stripe.secret')) && filled(config('services.stripe.key'));
    }

    public static function client(): StripeClient
    {
        return new StripeClient(config('services.stripe.secret'));
    }

    /** Whole dollars → the smallest currency unit Stripe bills in. */
    public static function toMinorUnit($dollars): int
    {
        // Rounded, not cast: (int)(0.1 + 0.7) * 100 is the classic way to lose
        // a cent to binary floating point.
        return (int) round(((float) $dollars) * 100);
    }

    /**
     * What this thing costs, read off the server's own records.
     *
     * Returns null when nothing is payable — a lesson with no catalogue entry,
     * or a free course — so the caller can refuse rather than charging zero.
     */
    public static function priceOf(Model $payable): ?int
    {
        if ($payable instanceof Booking) {
            $price = optional($payable->lesson)->price;
        } elseif ($payable instanceof CourseEnrollment) {
            $price = optional($payable->course)->price;
        } else {
            return null;
        }

        if ($price === null) {
            return null;
        }

        $amount = self::toMinorUnit($price);

        // Stripe's own floor for USD. A $0 lesson is not a payment at all.
        return $amount >= 50 ? $amount : null;
    }

    /**
     * The PaymentIntent for this purchase, created on first ask and REUSED
     * afterwards.
     *
     * Reuse matters: the checkout page can be reloaded, and minting a fresh
     * intent each time would litter the Stripe dashboard with abandoned
     * intents for a single purchase and make the payment history unreadable.
     * A row whose amount no longer matches (the tutor edited the price) is
     * updated rather than duplicated.
     */
    public static function intentFor(Model $payable, int $userId): Payment
    {
        $amount = self::priceOf($payable);
        abort_if($amount === null, 422, 'There is nothing to pay for here.');

        $currency = config('services.stripe.currency', 'usd');
        $stripe = self::client();

        $existing = Payment::where('payable_type', get_class($payable))
            ->where('payable_id', $payable->getKey())
            ->where('user_id', $userId)
            ->whereIn('status', [Payment::STATUS_PENDING, Payment::STATUS_PROCESSING])
            ->latest('id')
            ->first();

        if ($existing) {
            if ($existing->amount !== $amount) {
                $stripe->paymentIntents->update(
                    $existing->stripe_payment_intent_id,
                    ['amount' => $amount]
                );
                $existing->update(['amount' => $amount]);
            }

            return $existing;
        }

        $intent = $stripe->paymentIntents->create([
            'amount' => $amount,
            'currency' => $currency,
            // Lets Stripe offer whatever the account has enabled (cards,
            // wallets) without this app having to enumerate them.
            'automatic_payment_methods' => ['enabled' => true],
            /* The webhook fulfils from this metadata alone. It must never have
               to trust anything the browser sends back, because the browser may
               never come back at all. */
            'metadata' => [
                'payable_type' => get_class($payable),
                'payable_id' => (string) $payable->getKey(),
                'user_id' => (string) $userId,
            ],
        ]);

        return Payment::create([
            'user_id' => $userId,
            'payable_type' => get_class($payable),
            'payable_id' => $payable->getKey(),
            'stripe_payment_intent_id' => $intent->id,
            'amount' => $amount,
            'currency' => $currency,
            'status' => Payment::STATUS_PENDING,
        ]);
    }

    /**
     * Refund a settled payment in full.
     *
     * Safe to call on anything: a purchase that was never paid, already
     * refunded, or made while Stripe was switched off simply returns false.
     * That is what lets `cancel` and `decline` call it unconditionally instead
     * of each restating the same three checks.
     */
    public static function refund(Model $payable): bool
    {
        if (! self::configured()) {
            return false;
        }

        $payment = Payment::where('payable_type', get_class($payable))
            ->where('payable_id', $payable->getKey())
            ->where('status', Payment::STATUS_SUCCEEDED)
            ->latest('id')
            ->first();

        if (! $payment) {
            return false;
        }

        try {
            $refund = self::client()->refunds->create([
                'payment_intent' => $payment->stripe_payment_intent_id,
            ]);

            $payment->update([
                'status' => Payment::STATUS_REFUNDED,
                'stripe_refund_id' => $refund->id,
                'refunded_at' => now(),
            ]);

            return true;
        } catch (\Throwable $e) {
            /* Logged and swallowed, deliberately. A refund that fails must not
               block the cancellation the user asked for — leaving a lesson
               un-cancelled because Stripe was unreachable is worse than a
               refund that has to be issued by hand. The `payments` row keeps
               `succeeded`, so the money is still visibly owed. */
            Log::error('Stripe refund failed', [
                'payment_id' => $payment->id,
                'intent' => $payment->stripe_payment_intent_id,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
