<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A group course: a fixed schedule sold as one block.
 *
 * The opposite shape to TutorLesson — a lesson is a length and a price the
 * student schedules themselves, a course is a set of dates they accept. That is
 * why `price` is for the whole run rather than per class.
 */
class Course extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'level',
        'outcomes',
        'price',
        'weeks',
        'total_classes',
        'classes_per_week',
        'minutes_per_class',
        'capacity',
        'starts_on',
        'ends_on',
        'days_of_week',
        'start_time',
        'end_time',
    ];

    protected $casts = [
        'price' => 'integer',
        'weeks' => 'integer',
        'total_classes' => 'integer',
        'classes_per_week' => 'integer',
        'minutes_per_class' => 'integer',
        'capacity' => 'integer',
        'days_of_week' => 'array',
        'starts_on' => 'date',
        'ends_on' => 'date',
    ];

    /** Seats sold. Only settled enrolments count against capacity. */
    protected $appends = ['seats_taken'];

    public function getSeatsTakenAttribute(): int
    {
        // relationLoaded keeps the list endpoint from firing a query per row;
        // withCount supplies the aggregate there instead.
        if (isset($this->attributes['live_enrollments_count'])) {
            return (int) $this->attributes['live_enrollments_count'];
        }

        return $this->liveEnrollments()->count();
    }

    public function tutorProfile()
    {
        return $this->belongsTo(TutorProfile::class);
    }

    public function enrollments()
    {
        return $this->hasMany(CourseEnrollment::class);
    }

    /** Enrolments that occupy a seat — a cancelled one frees it again. */
    public function liveEnrollments()
    {
        return $this->hasMany(CourseEnrollment::class)->whereIn('status', ['held', 'confirmed']);
    }
}
