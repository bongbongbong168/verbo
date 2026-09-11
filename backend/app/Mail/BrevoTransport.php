<?php

namespace App\Mail;

use Illuminate\Support\Facades\Http;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\MessageConverter;

/**
 * Delivers mail through Brevo's HTTP API instead of SMTP.
 *
 * THIS EXISTS BECAUSE RAILWAY BLOCKS EVERY OUTBOUND SMTP PORT. Measured from
 * inside the running container: 25, 465 and 587 to smtp.gmail.com all time
 * out, while 443 is open. It is an anti-spam policy, not a misconfiguration,
 * so no combination of host, port or credentials can get around it — the mail
 * has to leave over HTTPS or not at all.
 *
 * It is a Symfony transport rather than a direct API call in the one place
 * that sends mail, so `Notification`, the Blade mail templates and every test
 * using `Notification::fake()` keep working untouched. Only the wire format
 * underneath changes, which is also what makes swapping to another provider
 * later a matter of writing a sibling of this class.
 *
 * Brevo was chosen for a narrow reason: it is the only free tier that will
 * send to arbitrary recipients from a **single verified sender address**,
 * with no DNS domain ownership. Verbo has no domain of its own — the site is
 * a vercel.app subdomain — so providers that gate that behind domain
 * verification would only be able to email the owner.
 */
class BrevoTransport extends AbstractTransport
{
    private const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

    public function __construct(
        private string $key,
        private int $timeout = 10,
    ) {
        parent::__construct();
    }

    protected function doSend(SentMessage $message): void
    {
        $email = MessageConverter::toEmail($message->getOriginalMessage());

        $from = $email->getFrom()[0] ?? null;

        if (! $from) {
            // Brevo rejects a message with no sender, and its error for that
            // is opaque. Saying it here names the actual setting to fix.
            throw new TransportException('No From address — set MAIL_FROM_ADDRESS to a sender verified in Brevo.');
        }

        $payload = array_filter([
            'sender' => $this->address($from),
            'to' => $this->addresses($email->getTo()),
            'cc' => $this->addresses($email->getCc()),
            'bcc' => $this->addresses($email->getBcc()),
            'replyTo' => ($r = $email->getReplyTo()[0] ?? null) ? $this->address($r) : null,
            'subject' => $email->getSubject(),
            'htmlContent' => $email->getHtmlBody(),
            'textContent' => $email->getTextBody(),
            'attachment' => $this->attachments($email),
        ], fn ($v) => $v !== null && $v !== []);

        $response = Http::timeout($this->timeout)
            // The key travels as a HEADER, never in the URL. A URL reaches
            // logs, proxies and error messages — which is exactly how this
            // project once wrote a live Gemini key into laravel.log.
            ->withHeaders(['api-key' => $this->key, 'accept' => 'application/json'])
            ->asJson()
            ->post(self::ENDPOINT, $payload);

        if ($response->failed()) {
            /* Brevo answers with {"code": "...", "message": "..."}. Only those
               two are surfaced, and only into the exception that
               EmailCodeService catches and logs — the caller gets a plain
               sentence. The request body is deliberately not included: it
               holds the recipient's address and the message itself. */
            $body = $response->json();
            $detail = is_array($body)
                ? trim(($body['code'] ?? '').' '.($body['message'] ?? ''))
                : '';

            throw new TransportException(
                'Brevo refused the message (HTTP '.$response->status().')'.($detail !== '' ? ': '.$detail : '')
            );
        }
    }

    /** @param Address[] $addresses */
    private function addresses(array $addresses): array
    {
        return array_map(fn (Address $a) => $this->address($a), $addresses);
    }

    private function address(Address $address): array
    {
        // Brevo rejects an empty `name`, so it is only sent when there is one.
        return array_filter([
            'email' => $address->getAddress(),
            'name' => $address->getName() ?: null,
        ], fn ($v) => $v !== null);
    }

    /**
     * Nothing in Verbo currently mails an attachment — the only mail it sends
     * is a six-digit code. Supported anyway because the alternative is an
     * attachment silently vanishing the first time someone adds one.
     */
    private function attachments($email): array
    {
        $out = [];

        foreach ($email->getAttachments() as $attachment) {
            $out[] = [
                'name' => $attachment->getFilename(),
                'content' => base64_encode($attachment->getBody()),
            ];
        }

        return $out;
    }

    public function __toString(): string
    {
        return 'brevo';
    }
}
