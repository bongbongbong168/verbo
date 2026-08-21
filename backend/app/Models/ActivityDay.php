<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ActivityDay extends Model
{
    use HasFactory;

    protected $fillable = [
        'day',
        'seconds',
        'last_beat_at',
    ];

    /**
     * `day` is deliberately NOT cast to a date. The cast writes it back as
     * "Y-m-d 00:00:00", so a firstOrCreate() keyed on "Y-m-d" never matches the
     * stored value and tries to insert a duplicate every beat. Kept as a plain
     * Y-m-d string, the lookup and the stored value are the same thing.
     */
    protected $casts = [
        'seconds' => 'integer',
        'last_beat_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
