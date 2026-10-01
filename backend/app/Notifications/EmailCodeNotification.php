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

        return (new MailMessage)
            ->subject($this->code.' is your Verbo '.($reset ? 'password reset' : 'verification').' code')
            ->view(['html' => 'emails.code', 'text' => 'emails.code-text'], [
                'code' => $this->code,
                'minutes' => $minutes,
                'reset' => $reset,
            ]);
    }
}
