<?php

namespace App\Rules;

use App\Services\SafeBrowsingService;
use Illuminate\Contracts\Validation\Rule;

/**
 * Rejects a field containing a link Google Safe Browsing flags as dangerous.
 *
 * Written as a validation rule rather than a check inside each controller so
 * that every place a user's text reaches another user says the same thing the
 * same way, and so a new one only has to add the rule to its `validate()` call
 * rather than remember an entire procedure.
 *
 * Works on free text (a message, a comment, a bio) and on a plain URL field
 * alike — `extractUrls` finds the link either way, so a `video_url` needs no
 * separate rule.
 *
 * When Safe Browsing is not configured, or its API cannot be reached, this
 * PASSES. See SafeBrowsingService for why failing open is the deliberate
 * choice.
 */
class NoUnsafeLinks implements Rule
{
    /** @var array{url: string, threat: string}|null */
    private ?array $threat = null;

    public function passes($attribute, $value): bool
    {
        if (! is_string($value) || trim($value) === '') {
            return true;
        }

        $this->threat = app(SafeBrowsingService::class)->firstThreatInText($value);

        return $this->threat === null;
    }

    public function message(): string
    {
        $what = $this->threat
            ? SafeBrowsingService::describe($this->threat['threat'])
            : 'an unsafe site';

        // Names what was found without accusing the sender — a forwarded link
        // is the common case, and the person pasting it usually does not know.
        return "This contains a link to {$what}, so it was not posted. Remove the link and try again.";
    }
}
