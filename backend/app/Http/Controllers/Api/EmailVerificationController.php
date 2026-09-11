<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailCode;
use App\Services\EmailCodeService;
use Illuminate\Http\Request;

/**
 * "Is this really your address?" — the code sent after sign-up.
 *
 * VERIFYING IS NOT A GATE. An unverified account works normally and is only
 * nagged by a banner. Blocking the app until a code arrives means one mail
 * outage locks out every new sign-up at once, and this app has no queue to
 * retry with — the failure would be total and silent. The flag records a fact
 * worth having; it does not hold the product hostage to a third party.
 *
 * Both routes are behind `auth:sanctum` and read the address off the SESSION,
 * never the request, so neither can be pointed at somebody else's account.
 */
class EmailVerificationController extends Controller
{
    /** Send (or resend) the code for the signed-in account. */
    public function send(Request $request)
    {
        $user = $request->user();

        if ($user->email_verified_at) {
            // Not an error — a second tab, or a back button. Saying so beats
            // sending a code for something already done.
            return response()->json(['message' => 'Your email is already confirmed.', 'verified' => true]);
        }

        if (! EmailCodeService::configured()) {
            return response()->json([
                'message' => 'This server cannot send email yet, so it cannot confirm your address.',
                'verified' => false,
            ], 503);
        }

        if (! EmailCodeService::send($user, EmailCode::VERIFY)) {
            return response()->json([
                'message' => 'We could not send the email just now. Please try again in a few minutes.',
                'verified' => false,
            ], 503);
        }

        return response()->json([
            'message' => 'We sent a code to '.$user->email.'. It expires in '.EmailCode::TTL_MINUTES.' minutes.',
            'verified' => false,
        ]);
    }

    /** Check the code and stamp the account. */
    public function confirm(Request $request)
    {
        $data = $request->validate([
            'code' => ['required', 'string'],
        ]);

        $user = $request->user();

        if ($user->email_verified_at) {
            return response()->json(['message' => 'Your email is already confirmed.', 'user' => $user->fresh()]);
        }

        if (! EmailCode::consume($user->email, EmailCode::VERIFY, $data['code'])) {
            /* One message for every failure — wrong digits, expired, already
               spent, out of attempts. Naming which would tell someone
               grinding codes whether they were close, and "that code is
               expired" against "that code is wrong" is the difference
               between knowing a guess was right and knowing nothing. */
            return response()->json([
                'message' => 'That code is not valid. Ask for a new one and try again.',
            ], 422);
        }

        $user->forceFill(['email_verified_at' => now()])->save();

        return response()->json([
            'message' => 'Your email is confirmed.',
            'user' => $user->fresh(),
        ]);
    }
}
