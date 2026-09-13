<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentMethod extends Model
{
    use HasFactory;

    /**
     * The brands this app will store, and therefore the list the validator
     * checks against.
     *
     * A closed list rather than free text for the same reason
     * `RecentViewController::TYPES` and `FlashcardController::SOURCES` are
     * closed: the value arrives from the client and is rendered back to the
     * owner, so anything goes in unless something says otherwise. It also
     * keeps the card art honest — a brand nothing can draw would render as a
     * blank chip.
     */
    public const BRANDS = ['visa', 'mastercard', 'amex', 'discover', 'jcb', 'unionpay', 'card'];

    /**
     * `is_default` and `provider_ref` are deliberately NOT fillable.
     *
     * Which card is the default is decided by an endpoint that also has to
     * clear the flag from every other row, and a provider token is issued by
     * the provider — never posted by the browser. Same rule that keeps
     * `join_code` and `avatar_path` out of their models' fillable lists.
     */
    protected $fillable = ['brand', 'last4', 'exp_month', 'exp_year', 'label'];

    protected $casts = [
        'exp_month' => 'integer',
        'exp_year' => 'integer',
        'is_default' => 'boolean',
    ];

    /** Never serialise the provider's token — it is a credential. */
    protected $hidden = ['provider_ref'];

    protected $appends = ['is_expired'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * A card is dead from the first day of the month AFTER the one printed on
     * it — an 08/2026 card is good through the whole of August 2026.
     */
    public function getIsExpiredAttribute(): bool
    {
        $end = \Carbon\Carbon::createFromDate($this->exp_year, $this->exp_month, 1)->endOfMonth();

        return $end->isPast();
    }
}
