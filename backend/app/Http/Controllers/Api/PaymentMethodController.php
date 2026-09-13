<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentMethod;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The cards a person has saved.
 *
 * NOTHING HERE EVER RECEIVES A CARD NUMBER. The browser reads the number long
 * enough to work out the brand and the last four digits and then forgets it;
 * only those two facts and the expiry are posted. There is no column for a
 * number (see the migration) and no parameter for one here, so a client that
 * sent one would simply have it dropped by validation.
 */
class PaymentMethodController extends Controller
{
    /** Newest first, but the default card always leads. */
    public function index(Request $request)
    {
        return $request->user()
            ->paymentMethods()
            ->orderByDesc('is_default')
            ->orderByDesc('id')
            ->get();
    }

    public function store(Request $request)
    {
        $now = now();

        $data = $request->validate([
            'brand' => ['required', Rule::in(PaymentMethod::BRANDS)],
            'last4' => ['required', 'digits:4'],
            'exp_month' => ['required', 'integer', 'between:1,12'],
            /* A card cannot already be dead when it is saved, and nobody has
               one good for twenty years. The window is checked here rather
               than only in the browser, where it is a convenience. */
            'exp_year' => ['required', 'integer', 'between:'.$now->year.','.($now->year + 20)],
            'label' => ['nullable', 'string', 'max:40'],
        ]);

        $expiresEnd = \Carbon\Carbon::createFromDate($data['exp_year'], $data['exp_month'], 1)->endOfMonth();
        if ($expiresEnd->isPast()) {
            return response()->json([
                'message' => 'That card has already expired.',
            ], 422);
        }

        $method = DB::transaction(function () use ($request, $data) {
            $method = $request->user()->paymentMethods()->create($data);

            /* The first card saved is the default, because a list of one with
               nothing marked reads as unfinished — and because the checkout
               needs something to pre-select. `is_default` is not fillable, so
               it is set here rather than posted. */
            if ($request->user()->paymentMethods()->count() === 1) {
                $method->forceFill(['is_default' => true])->save();
            }

            return $method;
        });

        return response()->json($method, 201);
    }

    /** Make this the card the checkout pre-selects. */
    public function setDefault(Request $request, PaymentMethod $paymentMethod)
    {
        $this->authorizeOwner($request, $paymentMethod);

        DB::transaction(function () use ($request, $paymentMethod) {
            // Exactly one default per person, so the old one is cleared in the
            // same transaction rather than left for a later write to tidy up.
            $request->user()->paymentMethods()->update(['is_default' => false]);
            $paymentMethod->forceFill(['is_default' => true])->save();
        });

        return $this->index($request);
    }

    public function destroy(Request $request, PaymentMethod $paymentMethod)
    {
        $this->authorizeOwner($request, $paymentMethod);

        DB::transaction(function () use ($request, $paymentMethod) {
            $wasDefault = $paymentMethod->is_default;
            $paymentMethod->delete();

            /* Removing the default must not leave the list with none — the
               next card takes over, so the checkout always has something to
               pre-select. */
            if ($wasDefault) {
                $next = $request->user()->paymentMethods()->orderByDesc('id')->first();
                if ($next) {
                    $next->forceFill(['is_default' => true])->save();
                }
            }
        });

        return $this->index($request);
    }

    /**
     * SQLite hands foreign keys back as strings, so a bare `!==` would 403 the
     * rightful owner — the cast is the documented fix used everywhere here.
     */
    private function authorizeOwner(Request $request, PaymentMethod $method): void
    {
        abort_unless((int) $method->user_id === (int) $request->user()->id, 403);
    }
}
