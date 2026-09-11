<?php

namespace App\Notifications;

use App\Models\EmailCode;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The mail that carries a one-time code.
 *
 * One notification for both purposes rather than two near-identical classes —
 * the wording differs by a sentence, and the security notice at the end is
 * the part that must never diverge between them.
 *
 * NOT queued. This app runs no queue worker at all (the same constraint that
 * leaves time-based notifications unbuilt), so `ShouldQueue` here would mean
 * the mail is dispatched to a queue nothing ever drains and the code silently
 * never arrives.
 */
class EmailCodeNotification extends Notification
{
    public function __construct(
        public string $code,
        public string $purpose,
    ) {
    }

    public function via($notifiable)
    {
        return ['mail'];
    }

    public function toMail($notifiable)
    {
        $minutes = EmailCode::TTL_MINUTES;
        $reset = $this->purpose === EmailCode::RESET;

        $mail = (new MailMessage)
            ->subject($this->code.' is your Verbo '.($reset ? 'password reset' : 'verification').' code')
            ->greeting($reset ? 'Resetting your password' : 'Welcome to Verbo');

        $mail->line($reset
            ? 'Use this code to set a new password:'
            : 'Use this code to confirm your email address:');

        /* The code on its own line and nothing else on it. Mail clients
           linkify and reflow aggressively, and a six-digit number buried in a
           sentence is the thing people have to hunt for on a phone. */
        $mail->line('**'.$this->code.'**');

        $mail->line("The code expires in {$minutes} minutes and can only be used once.");

        $mail->line($reset
            // Said plainly, because this mail is the ONLY warning an account
            // under attack gets — nobody but the attacker asked for it.
            ? 'If you did not ask to reset your password, ignore this email. Your password has not changed, and nobody can change it without this code.'
            : 'If you did not create a Verbo account, you can ignore this email.');

        return $mail->salutation('— Verbo');
    }
}
