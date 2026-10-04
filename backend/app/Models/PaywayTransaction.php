<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One ABA PayWay checkout for a lesson or a course. See PaywayService. */
class PaywayTransaction extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_PAID = 'paid';
    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'user_id', 'payable_type', 'payable_id', 'tran_id',
        'amount', 'currency', 'status', 'apv', 'paid_at',
    ];

    // Set explicitly: SQLite does not round-trip column defaults onto create().
    protected $attributes = ['status' => self::STATUS_PENDING];

    protected $casts = ['paid_at' => 'datetime', 'amount' => 'integer'];

    public function payable()
    {
        return $this->morphTo();
    }
}
