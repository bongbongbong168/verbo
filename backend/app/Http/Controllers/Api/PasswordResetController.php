<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

/**
 * Forgotten passwords — ask for a link, then use it.
 *
 * Built on Laravel's own password broker rather than a hand-rolled token
 * table: it already handles expiry, single use and the throttle between
 * requests, and those are exactly the parts that are dangerous to get wrong.
 * The one thing overridden is where the link points (see AuthServiceProvider:
 * the UI is a separate origin, so Laravel's default would send people to a
 * 404 on the API domain).
 *
 * MAIL IS NOT ASSUMED TO EXIST. The rest of this app gates optional services
 * behind a `configured()` check — Stripe, Safe Browsing, Gemini — and mail is
 * the same: a checkout with no mailer answers with a plain "this server
 * cannot send email yet" instead of a 500 from deep inside the transport.
 */
class PasswordResetController extends Controller
{
    /**
     * Is there a mailer that can actually deliver?
     *
     * `log` and `array` are real Laravel drivers that "succeed" while sending
     * nothing a person will ever see, so they do not count as configured for
     * a flow whose entire purpose is to reach someone's inbox.
     */
    public static function canSendMail(): bool
    {
        return ! in_array(config('mail.default'), ['log', 'array', null], true);
    }

    /**
     * Ask the broker to send, and never let the mail transport reach the user.
     *
     * `canSendMail()` can only see the driver NAME. A configured-but-unreachable
     * SMTP server still throws from deep inside the transport, and that message
     * carries the mail host and port and PHP's own socket internals — locally
     * it surfaced in the UI as `Connection could not be established with host
     * "mailpit:1025": stream_socket_client : php_network_getaddresses…`. That is
     * infrastructure detail, and it is no more use to the person reading it
     * than the tesseract command line ScanController catches for the same
     * reason. Logged, then answered as the plain 503 a dead mailer already gets.
     *
     * @return string|\Illuminate\Http\JsonResponse the broker status, or the
     *                                              response to return as-is
     */
    private function trySend(string $email)
    {
        try {
            return Password::sendResetLink(['email' => $email]);
        } catch (\Throwable $e) {
            Log::error('Password reset mail failed to send', ['error' => $e->getMessage()]);

            return response()->json([
                'message' => 'We could not send the email just now. Please try again in a few minutes.',
            ], 503);
        }
    }

    /**
     * "Send me a reset link."
     *
     * ALWAYS answers the same way, whether or not the address is one we know.
     * Telling a stranger "no account with that email" turns this endpoint into
     * a way to test which of a list of addresses have Verbo accounts. Laravel's
     * broker is built around the same rule; the responses are flattened here
     * so a timing-free, identical body goes back either way.
     */
    public function sendLink(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'email']]);

        if (! self::canSendMail()) {
            return response()->json([
                'message' => 'This server cannot send email yet, so a reset link cannot be delivered. Ask an administrator to reset your password.',
            ], 503);
        }

        $status = $this->trySend($data['email']);

        if (! is_string($status)) {
            return $status;
        }

        if ($status === Password::RESET_THROTTLED) {
            return response()->json([
                'message' => 'A link was sent very recently. Check your inbox, then try again in a minute.',
            ], 429);
        }

        return response()->json([
            'message' => 'If that email has a Verbo account, a reset link is on its way. The link expires in an hour.',
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
    public function sendLinkToSelf(Request $request)
    {
        if (! self::canSendMail()) {
            return response()->json([
                'message' => 'This server cannot send email yet, so a reset link cannot be delivered.',
            ], 503);
        }

        $status = $this->trySend($request->user()->email);

        if (! is_string($status)) {
            return $status;
        }

        if ($status === Password::RESET_THROTTLED) {
            return response()->json([
                'message' => 'A link was sent very recently. Check your inbox, then try again in a minute.',
            ], 429);
        }

        return response()->json([
            'message' => 'A reset link is on its way to '.$request->user()->email.'. It expires in an hour.',
        ]);
    }

    /** Spend the token and set the new password. */
    public function reset(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            // Same rule as registration, so a password set here cannot be
            // weaker than one set anywhere else.
            'password' => ['required', 'confirmed', PasswordRule::min(8)],
        ]);

        $status = Password::reset($data, function ($user, string $password) {
            $user->forceFill([
                'password' => Hash::make($password),
                // Invalidates the "remember me" cookie for good measure; this
                // app is token-based, but the column exists and a stale value
                // outliving a reset would be wrong.
                'remember_token' => Str::random(60),
            ])->save();

            /*
             * EVERY EXISTING TOKEN IS REVOKED. Someone resetting a password
             * has usually lost control of it — a shared machine, a phone left
             * somewhere, a password they suspect is known. Leaving old Sanctum
             * tokens alive would mean the new password changes nothing for
             * whoever already had a session. Settings' own change-password
             * route spares the caller's token because they are holding it;
             * here there is no caller session to spare.
             */
            $user->tokens()->delete();

            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'message' => 'That reset link is invalid or has expired. Ask for a new one.',
            ], 422);
        }

        return response()->json([
            'message' => 'Your password has been changed. Sign in with it now.',
        ]);
    }
}
