<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One row per (user, thing) recording when they last opened it. Polymorphic so
 * a study unit and a podcast can sit in the same recency order — see
 * RecentViewController, which owns the whitelist of what may be recorded.
 */
class RecentView extends Model
{
    use HasFactory;

    protected $fillable = [
        'viewable_type',
        'viewable_id',
        'last_viewed_at',
    ];

    protected $casts = [
        'last_viewed_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function viewable()
    {
        return $this->morphTo();
    }
}
