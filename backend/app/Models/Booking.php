<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    use HasFactory;

    /** How long an unpaid hold survives before the slot is released. */
    public const HOLD_MINUTES = 15;

    protected $fillable = [
        'student_id',
        'tutor_id',
        'tutor_lesson_id',
        'message',
        'status',
        'starts_at',
        'duration_minutes',
        'hold_expires_at',
        'decline_reason',
        'cancelled_by',
        'hidden_for_student_at',
        'hidden_for_tutor_at',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'hold_expires_at' => 'datetime',
        'duration_minutes' => 'integer',
    ];

    /**
     * A booking still waiting on something that can no longer happen: a hold
     * whose payment window has passed, OR any unanswered request (held or
     * paid-and-pending) whose lesson time has already started. The second
     * case was missing, so a paid request the tutor never answered sat as
     * "pending" forever - a Sep 1 lesson still waiting on Sep 19.
     */
    public function getIsExpiredAttribute(): bool
    {
        if (! in_array($this->status, ['held', 'pending'], true)) {
            return false;
        }
        $holdLapsed = $this->status === 'held'
            && $this->hold_expires_at !== null
            && $this->hold_expires_at->isPast();

        return $holdLapsed || ($this->starts_at !== null && $this->starts_at->isPast());
    }

    /**
     * Still something someone is waiting on or attending: an unexpired
     * request, or a confirmed lesson that has not started. Everything else is
     * history and may be cleared from a list.
     */
    public function isLive(): bool
    {
        if (in_array($this->status, ['held', 'pending'], true)) {
            return ! $this->is_expired;
        }

        return $this->status === 'confirmed'
            && ! ($this->starts_at !== null && $this->starts_at->isPast());
    }

    /**
     * Bookings that actually occupy their time.
     *
     * One definition, because this predicate decides three different things and
     * they must agree: which slots a tutor can still be booked for, which times
     * a STUDENT is already committed to, and — mirrored in raw SQL — the
     * partial unique index on (tutor_id, starts_at). If they ever drift, the
     * calendar offers a time the insert then refuses.
     *
     * `pending` is paid and waiting on the tutor, so it still holds the slot.
     * `cancelled` / `declined` / `expired` sit outside it, which is what frees
     * a time with no cleanup job. A lapsed hold is excluded here too, so it
     * stops occupying its slot the moment it expires.
     */
    public function scopeOccupying($query)
    {
        return $query->where(function ($q) {
            $q->whereIn('status', ['confirmed', 'pending'])
                ->orWhere(function ($q) {
                    $q->where('status', 'held')
                        ->where(function ($q) {
                            $q->whereNull('hold_expires_at')
                                ->orWhere('hold_expires_at', '>', now());
                        });
                });
        });
    }

    public function lesson()
    {
        return $this->belongsTo(TutorLesson::class, 'tutor_lesson_id');
    }

    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function tutor()
    {
        return $this->belongsTo(User::class, 'tutor_id');
    }
}
