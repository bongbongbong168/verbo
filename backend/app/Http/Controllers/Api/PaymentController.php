<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CourseEnrollment;
use App\Models\Payment;
use App\Services\PaymentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Stripe\Exception\SignatureVerificationException;
use Stripe\Webhook;

/**
 * The live payment path.
 *
 * The browser creates an intent here, confirms it directly with Stripe (card
 * details never touch this server), and STRIPE tells us it succeeded via the
 * webhook. Fulfilment hangs off the webhook and nothing else: a student who
 * pays and immediately closes the tab must still get their lesson, and a
 * browser that says "I paid" must never be believed on its own.
 */
class PaymentController extends Controller
{
    /**
     * Is Stripe switched on, and what is the publishable key?
     *
     * The frontend asks before rendering the card form, so a checkout with no
     * keys configured falls back to the demo button rather than mounting an
     * Element that can never work.
     */
    public function config()
    {
        return [
            'enabled' => PaymentService::configured(),
            // Publishable key — designed to be public, unlike the secret.
            'publishable_key' => PaymentService::configured()
                ? config('services.stripe.key')
                : null,
        ];
    }

    /**
     * Create (or reuse) the PaymentIntent for one purchase.
     *
     * The amount is NEVER taken from the request — it is read off the lesson or
     * the course server-side, so a client cannot name its own price.
     */
    public function intent(Request $request)
    {
        abort_unless(PaymentService::configured(), 422, 'Payments are not configured.');

        $data = $request->validate([
            'kind' => ['required', 'string', 'in:'.implode(',', array_keys(PaymentService::PAYABLES))],
            'id' => ['required', 'integer'],
        ]);

        $payable = $this->resolve($data['kind'], (int) $data['id'], $request);

        $payment = PaymentService::intentFor($payable, $request->user()->id);

        $intent = PaymentService::client()
            ->paymentIntents
            ->retrieve($payment->stripe_payment_intent_id);

        return [
            // The client secret authorises confirming THIS intent and nothing
            // else, which is why it is safe to hand to the browser.
            'client_secret' => $intent->client_secret,
            'amount' => $payment->amount,
            'currency' => $payment->currency,
        ];
    }

    /**
     * Find what is being paid for, and refuse if it is not this user's to pay
     * or is no longer payable.
     *
     * Both checks matter: without the first, anyone could pay for — and thereby
     * confirm — a stranger's booking; without the second, a student could pay
     * for a hold that already lapsed and lost its slot.
     */
    private function resolve(string $kind, int $id, Request $request)
    {
        $class = PaymentService::PAYABLES[$kind];

        if ($class === Booking::class) {
            $booking = Booking::with('lesson')->findOrFail($id);
            abort_unless((int) $booking->student_id === $request->user()->id, 403);
            abort_if(
                $booking->status !== 'held' || $booking->is_expired,
                422,
                'That hold has expired — please pick a time again.'
            );

            return $booking;
        }

        $enrollment = CourseEnrollment::with('course')->findOrFail($id);
        abort_unless((int) $enrollment->user_id === $request->user()->id, 403);
        abort_if($enrollment->status !== 'held', 422, 'That enrolment is no longer open.');

        return $enrollment;
    }

    /**
     * Stripe calls this. Nothing else may.
     *
     * The signature check IS the authentication — this route sits outside
     * `auth:sanctum` because Stripe holds no token, so an unverified request
     * here would let anyone on the internet confirm any booking for free.
     */
    public function webhook(Request $request)
    {
        $secret = config('services.stripe.webhook_secret');
        abort_unless(filled($secret), 400, 'Webhook secret is not configured.');

        try {
            $event = Webhook::constructEvent(
                $request->getContent(),
                $request->header('Stripe-Signature', ''),
                $secret
            );
        } catch (SignatureVerificationException | \UnexpectedValueException $e) {
            // 400, never 500: an unsigned or malformed call is a bad request,
            // and Stripe should not retry it.
            Log::warning('Rejected a Stripe webhook', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Invalid signature.'], 400);
        }

        $intent = $event->data->object;

        switch ($event->type) {
            case 'payment_intent.succeeded':
                $this->fulfil($intent);
                break;

            case 'payment_intent.payment_failed':
            case 'payment_intent.canceled':
                Payment::where('stripe_payment_intent_id', $intent->id)
                    ->update(['status' => Payment::STATUS_CANCELED]);
                break;

            case 'charge.refunded':
                // A refund issued from the Stripe dashboard rather than by this
                // app still has to be reflected here, or the two disagree about
                // whether the money is still held.
                Payment::where('stripe_payment_intent_id', $intent->payment_intent ?? '')
                    ->whereNull('refunded_at')
                    ->update([
                        'status' => Payment::STATUS_REFUNDED,
                        'refunded_at' => now(),
                    ]);
                break;
        }

        // Always 200 for an event we understood. A non-2xx makes Stripe retry,
        // and retrying something we have already handled achieves nothing.
        return response()->json(['received' => true]);
    }

    /**
     * Money arrived — hand over what was bought.
     *
     * Idempotent at two levels: the payment row is only advanced from an unpaid
     * state, and both `settle()` methods no-op unless the thing is still held.
     * Stripe retries deliveries, so this WILL be called more than once.
     */
    private function fulfil($intent): void
    {
        $payment = Payment::where('stripe_payment_intent_id', $intent->id)->first();

        if (! $payment) {
            /* An intent we have no record of. Logged rather than ignored: it
               means a payment was taken that this app cannot attribute, which
               is exactly the case somebody has to look at by hand. */
            Log::error('Stripe reported a payment for an unknown intent', [
                'intent' => $intent->id,
            ]);

            return;
        }

        if ($payment->status !== Payment::STATUS_SUCCEEDED) {
            $payment->update([
                'status' => Payment::STATUS_SUCCEEDED,
                'paid_at' => now(),
            ]);
        }

        $payable = $payment->payable;

        if ($payable instanceof Booking) {
            // A lesson becomes a REQUEST, not a confirmation — the tutor still
            // has to accept it. Paying is not accepting.
            BookingController::settle($payable);
        } elseif ($payable instanceof CourseEnrollment) {
            // A course confirms outright: there is no approval step.
            CourseController::settle($payable);
        }
    }

    /** The student's own payment history, newest first. */
    public function index(Request $request)
    {
        return Payment::where('user_id', $request->user()->id)
            ->with('payable')
            ->latest('id')
            ->limit(50)
            ->get()
            ->map(fn (Payment $p) => [
                'id' => $p->id,
                'amount' => $p->amount,
                'currency' => $p->currency,
                'status' => $p->status,
                'paid_at' => $p->paid_at,
                'refunded_at' => $p->refunded_at,
                'kind' => $p->payable_type === Booking::class ? 'lesson' : 'course',
            ]);
    }
}
