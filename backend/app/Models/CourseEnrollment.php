<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CourseEnrollment extends Model
{
    use HasFactory;

    /** Matches Booking::HOLD_MINUTES so both flows behave the same at payment. */
    public const HOLD_MINUTES = 15;

    protected $fillable = ['course_id', 'user_id', 'status', 'hold_expires_at', 'hidden_at'];

    protected $casts = ['hold_expires_at' => 'datetime'];

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
