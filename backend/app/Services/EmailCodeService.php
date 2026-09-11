<?php

namespace App\Services;

use App\Models\EmailCode;
use App\Models\User;
use App\Notifications\EmailCodeNotification;
use Illuminate\Support\Facades\Log;

/**
 * Issues a one-time code and puts it in the post.
 *
 * Shared by sign-up verification and password reset so the two cannot drift
 * on expiry, wording or how a mail failure is handled — the same reason
 * EditDrawer, ReaderSwitch and ArticleCover were extracted on the front end.
 *
 * Gated by `configured()` like PaymentService, SafeBrowsingService and
 * GeminiService, so a fresh checkout with no mail settings is still a usable
 * app rather than one that 500s on the sign-up screen.
 */
class EmailCodeService
{
    /**
     * Is there a mailer that can actually deliver?
     *
     * `log` and `array` are real Laravel drivers that "succeed" while sending
     * nothing a person will ever see, so they do not count for a flow whose
     * entire purpose is to reach someone's inbox.
     */
    public static function configured(): bool
    {
        $driver = config('mail.default');

        if (in_array($driver, ['log', 'array', null], true)) {
            return false;
        }

        /* A `brevo` driver with no API key cannot deliver, and saying so up
           front is more honest than letting the transport throw — the caller
           then reports "this server cannot send email yet", which names the
           real situation, rather than "try again in a few minutes", which
           invites someone to keep retrying something that will never work. */
        if ($driver === 'brevo' && ! config('services.brevo.key')) {
            return false;
        }

        return true;
    }

    /**
     * Mint a code for this user and email it.
     *
     * NEVER THROWS, and never returns the code. The digits stay inside this
     * method: handing them back would invite a caller to log them or, worse,
     * put them in a response body, which would turn "check your email" into
     * a formality anyone watching the network tab could skip.
     *
     * The failure path matters as much as the happy one. `configured()` only
     * sees the driver NAME, so a real `smtp` setting pointed at a host that
     * is not there sails past it and throws from inside the transport —
     * carrying the mail host, the port and PHP's socket internals. That is
     * logged for the operator and reported to the caller as a plain false,
     * the same rule ScanController follows for the tesseract command line.
     */
    public static function send(User $user, string $purpose): bool
    {
        if (! self::configured()) {
            return false;
        }

        try {
            $code = EmailCode::issue($user->email, $purpose);
            $user->notify(new EmailCodeNotification($code, $purpose));

            return true;
        } catch (\Throwable $e) {
            Log::error('Could not send an email code', [
                'purpose' => $purpose,
                // The address is already in this app's logs elsewhere; the
                // CODE is not, and must not be added here.
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
