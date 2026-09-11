<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailCode;
use App\Models\User;
use App\Services\EmailCodeService;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

/**
 * Forgotten passwords — ask for a code, then spend it.
 *
 * A SIX-DIGIT CODE RATHER THAN A LINK, and that is a real trade, not a style
 * choice. A link is longer and unguessable, but it only works in the browser
 * that opens the mail — on a phone that means the app's session lives in one
 * browser and the link opens in the mail client's own, which is exactly where
 * "it just takes me to a login screen" comes from. A code is typed into the
 * tab the person is already standing in. The guessability it costs is bought
 * back by EmailCode's attempt cap; see the note there.
 *
 * MAIL IS NOT ASSUMED TO EXIST, the same `configured()` gate Stripe, Safe
 * Browsing and Gemini all carry.
 */
class PasswordResetController extends Controller
{
    /**
     * "Send me a code."
     *
     * ALWAYS answers the same way, whether or not the address is one we know.
     * Telling a stranger "no account with that email" turns this endpoint
     * into a way to test which of a list of addresses have Verbo accounts.
     */
    public function sendCode(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'email']]);

        if (! EmailCodeService::configured()) {
            return response()->json([
                'message' => 'This server cannot send email yet, so a reset code cannot be delivered. Ask an administrator to reset your password.',
            ], 503);
        }

        $user = User::where('email', $data['email'])->first();

        /* Sent only to a real account, but the ANSWER below does not say so.
           A missing account is silent rather than an error, which is what
           keeps the two cases indistinguishable from outside. */
        if ($user && ! EmailCodeService::send($user, EmailCode::RESET)) {
            return response()->json([
                'message' => 'We could not send the email just now. Please try again in a few minutes.',
            ], 503);
        }

        return response()->json([
            'message' => 'If that email has a Verbo account, a code is on its way. It expires in '.EmailCode::TTL_MINUTES.' minutes.',
        ]);
    }

    /** Spend the code and set the new password. */
    public function reset(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'code' => ['required', 'string'],
            // Same rule as registration, so a password set here cannot be
            // weaker than one set anywhere else.
            'password' => ['required', 'confirmed', PasswordRule::min(8)],
        ]);

        $user = User::where('email', $data['email'])->first();

        /* The code is checked even when there is no such user, so the two
           paths cost the same work and answer the same way. Without the
           check, a missing account would return measurably faster than a
           wrong code and hand back the very fact the endpoint above hides. */
        $ok = EmailCode::consume($data['email'], EmailCode::RESET, $data['code']);

        if (! $user || ! $ok) {
            return response()->json([
                'message' => 'That code is not valid or has expired. Ask for a new one.',
            ], 422);
        }

        $user->forceFill([
            'password' => Hash::make($data['password']),
            // Invalidates the "remember me" cookie for good measure; this app
            // is token-based, but the column exists and a stale value
            // outliving a reset would be wrong.
            'remember_token' => Str::random(60),
            /* Getting a code at this address PROVES the address, so the
               account is verified by the same act. Leaving it unverified
               would nag someone who just demonstrated they hold the mailbox. */
            'email_verified_at' => $user->email_verified_at ?? now(),
        ])->save();

        /*
         * EVERY EXISTING TOKEN IS REVOKED. Someone resetting a password has
         * usually lost control of it — a shared machine, a phone left
         * somewhere, a password they suspect is known. Leaving old Sanctum
         * tokens alive would mean the new password changes nothing for
         * whoever already had a session. Settings' own change-password route
         * spares the caller's token because they are holding it; here there
         * is no caller session to spare.
         */
        $user->tokens()->delete();

        event(new PasswordReset($user));

        return response()->json([
            'message' => 'Your password has been changed. Sign in with it now.',
        ]);
    }

    /**
     * The same thing for someone already signed in.
     *
     * Settings can only CHANGE a password, and that form requires the current
     * one — which is no use to the person this is for: signed in on a device
     * that remembered them, and unable to recall the password itself. The
     * address is taken from the session rather than the request, so this
     * cannot be pointed at somebody else's account.
     */
    public function sendCodeToSelf(Request $request)
    {
        $user = $request->user();

        if (! EmailCodeService::configured()) {
            return response()->json([
                'message' => 'This server cannot send email yet, so a reset code cannot be delivered.',
            ], 503);
        }

        if (! EmailCodeService::send($user, EmailCode::RESET)) {
            return response()->json([
                'message' => 'We could not send the email just now. Please try again in a few minutes.',
            ], 503);
        }

        return response()->json([
            'message' => 'A reset code is on its way to '.$user->email.'. It expires in '.EmailCode::TTL_MINUTES.' minutes.',
        ]);
    }
}
