<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Hash;

/**
 * A one-time numeric code sent to an email address.
 *
 * Two purposes share this table — confirming an address after sign-up, and
 * getting back into an account whose password is forgotten — because the
 * mechanics are identical and two near-identical tables is how the two would
 * drift apart on expiry or attempt limits.
 *
 * `issue()` returns the PLAINTEXT code exactly once, for the mail to carry.
 * Nothing stores it: the row keeps only a hash, so the digits exist in memory
 * for the length of one request and in the recipient's inbox, nowhere else.
 */
class EmailCode extends Model
{
    public const VERIFY = 'verify';

    public const RESET = 'reset';

    public const PURPOSES = [self::VERIFY, self::RESET];

    /** Six digits. Long enough to be unguessable under the attempt cap below. */
    public const LENGTH = 6;

    /**
     * Ten minutes. Long enough to switch to a mail app and back, short enough
     * that a code left visible on a shared screen stops mattering quickly.
     */
    public const TTL_MINUTES = 10;

    /**
     * THE ATTEMPT CAP IS WHAT MAKES SIX DIGITS SAFE.
     *
     * A million possibilities sounds like plenty, but the AI bucket alone
     * allows 15 requests a minute — unlimited guesses would fall in under two
     * months of quiet grinding, and a botnet does it in an afternoon. Five
     * tries makes a blind guess a one-in-200,000 shot before the code dies.
     */
    public const MAX_ATTEMPTS = 5;

    protected $fillable = ['email', 'purpose', 'code_hash', 'attempts', 'expires_at', 'consumed_at'];

    protected $casts = [
        'expires_at' => 'datetime',
        'consumed_at' => 'datetime',
        'attempts' => 'integer',
    ];

    /**
     * `code_hash` is the credential and must never be serialised — this model
     * is small enough to be handed to a response by accident.
     */
    protected $hidden = ['code_hash'];

    /**
     * Mint a code for this address and purpose, and return the digits.
     *
     * ISSUING INVALIDATES EVERY EARLIER CODE for the same pair. Someone who
     * presses "resend" because the first mail was slow would otherwise have
     * two live codes, which doubles the guessing surface and makes "the code
     * did not work" depend on which email they happened to open.
     */
    public static function issue(string $email, string $purpose): string
    {
        if (! in_array($purpose, self::PURPOSES, true)) {
            throw new \InvalidArgumentException("Unknown email code purpose [{$purpose}].");
        }

        $email = mb_strtolower(trim($email));

        self::where('email', $email)
            ->where('purpose', $purpose)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        /* random_int, never rand()/mt_rand(): this is a credential, and those
           two are seeded predictably enough to reconstruct a sequence. */
        $code = str_pad((string) random_int(0, (10 ** self::LENGTH) - 1), self::LENGTH, '0', STR_PAD_LEFT);

        self::create([
            'email' => $email,
            'purpose' => $purpose,
            'code_hash' => Hash::make($code),
            'attempts' => 0,
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
        ]);

        return $code;
    }

    /**
     * Spend a code. True only if it matches, is live, and has tries left.
     *
     * A wrong guess is COUNTED even though it failed, which is the whole
     * point of the counter — and the row is consumed the moment the cap is
     * reached, so the attacker has to ask for a new code (and a new email
     * lands in the victim's inbox, which is its own alarm).
     */
    public static function consume(string $email, string $purpose, string $code): bool
    {
        $email = mb_strtolower(trim($email));

        $row = self::where('email', $email)
            ->where('purpose', $purpose)
            ->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        if (! $row) {
            return false;
        }

        if ($row->attempts >= self::MAX_ATTEMPTS) {
            $row->forceFill(['consumed_at' => now()])->save();

            return false;
        }

        if (! Hash::check($code, $row->code_hash)) {
            $row->increment('attempts');

            if ($row->attempts >= self::MAX_ATTEMPTS) {
                $row->forceFill(['consumed_at' => now()])->save();
            }

            return false;
        }

        // Single use. Marked before the caller acts on the result, so a
        // replay cannot land while the password write is still in flight.
        $row->forceFill(['consumed_at' => now()])->save();

        return true;
    }
}
