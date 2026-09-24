<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Subscription extends Model
{
    protected $fillable = [
        'user_id',
        'stripe_customer_id',
        'stripe_subscription_id',
        'stripe_price_id',
        'status',
        'current_period_start',
        'current_period_end',
        'cancel_at_period_end',
        'cancel_at',
        'canceled_at',
        'trial_end',
    ];

    protected $casts = [
        'current_period_start' => 'datetime',
        'current_period_end' => 'datetime',
        'cancel_at_period_end' => 'boolean',
        'cancel_at' => 'datetime',
        'canceled_at' => 'datetime',
        'trial_end' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function grantsAccess(): bool
    {
        return in_array($this->status, ['active', 'trialing', 'past_due'], true);
    }
}
