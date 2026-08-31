<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One Stripe PaymentIntent, and what it paid for.
 *
 * Amounts are stored in the smallest currency unit (cents) exactly as Stripe
 * holds them, so the two never disagree and no float ever touches money.
 */
class Payment extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'requires_payment_method';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_SUCCEEDED = 'succeeded';
    public const STATUS_CANCELED = 'canceled';
    public const STATUS_REFUNDED = 'refunded';

    protected $fillable = [
        'user_id',
        'payable_type',
        'payable_id',
        'stripe_payment_intent_id',
        'stripe_refund_id',
        'amount',
        'currency',
        'status',
        'paid_at',
        'refunded_at',
    ];

    /* SQLite does not round-trip column defaults onto the model create()
       returns — the same trap that bit Flashcard.source_module, Booking.status
       and Message.kind. */
    protected $attributes = [
        'status' => self::STATUS_PENDING,
        'currency' => 'usd',
    ];

    protected $casts = [
        'amount' => 'integer',
        'paid_at' => 'datetime',
        'refunded_at' => 'datetime',
    ];

    public function payable()
    {
        return $this->morphTo();
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /** Money actually taken and not given back. */
    public function isSettled(): bool
    {
        return $this->status === self::STATUS_SUCCEEDED;
    }

    /** Dollars, for display only — never for arithmetic. */
    public function getAmountDollarsAttribute(): float
    {
        return $this->amount / 100;
    }
}
