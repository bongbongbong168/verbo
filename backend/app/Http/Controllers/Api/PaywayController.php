<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaywayTransaction;
use App\Services\PaymentService;
use App\Services\PaywayService;
use Illuminate\Http\Request;

/**
 * ABA PayWay checkout.
 *
 *  POST /payway/checkout   (signed in) - signed fields for ABA's hosted page
 *  POST /payway/callback   (public)    - ABA's "something happened" ping
 *  GET  /payway/status/{tranId} (signed in, owner) - after returning to Verbo
 *
 * The callback and the status poll do the SAME thing: ask ABA's
 * check-transaction API and act on its answer. Nothing posted to us is
 * believed, which is why the public callback needs no signature of its own -
 * a forged ping can only make us ask ABA a question.
 */
class PaywayController extends Controller
{
    public function checkout(Request $request)
    {
        abort_unless(PaywayService::configured(), 422, 'ABA PayWay is not set up yet.');

        $data = $request->validate([
            // `pro` = one month of Verbo Pro for the signed-in account.
            'kind' => ['required', 'string', 'in:pro,'.implode(',', array_keys(PaymentService::PAYABLES))],
            'id' => ['required_unless:kind,pro', 'nullable', 'integer'],
        ]);

        if ($data['kind'] === 'pro') {
            return PaywayService::startCheckout($request->user(), $request->user(), '/upgrade/checkout');
        }

        $payable = PaymentController::resolvePayable($data['kind'], (int) $data['id'], $request);

        // Where ABA sends the student back to: this same checkout page.
        $returnPath = '/checkout/'.$data['kind'].'/'.$data['id'];

        return PaywayService::startCheckout($payable, $request->user(), $returnPath);
    }

    public function callback(Request $request)
    {
        $tranId = (string) ($request->input('tran_id') ?? data_get($request->json()->all(), 'tran_id', ''));
        $tx = $tranId !== '' ? PaywayTransaction::where('tran_id', $tranId)->first() : null;

        if ($tx) {
            PaywayService::reconcile($tx);
        }

        // Always 200: ABA should not retry a ping we have already acted on,
        // and an unknown tran_id is not something a retry can fix.
        return response()->json(['received' => true]);
    }

    public function status(Request $request, string $tranId)
    {
        $tx = PaywayTransaction::where('tran_id', $tranId)->firstOrFail();
        abort_unless((int) $tx->user_id === $request->user()->id, 404);

        $tx = PaywayService::reconcile($tx);

        return ['tran_id' => $tx->tran_id, 'status' => $tx->status];
    }
}
