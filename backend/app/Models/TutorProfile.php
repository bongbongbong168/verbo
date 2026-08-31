<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class TutorProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'bio',
        'subjects',
        'hourly_rate',
        'photo_path',
        'languages_spoken',
        'availability',
        'video_url',
        'timezone',
        'allows_pre_booking_questions',
    ];

    protected $appends = [
        'photo_url',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /** Group courses this tutor runs, the counterpart to lessons(). */
    public function courses()
    {
        return $this->hasMany(Course::class);
    }

    public function lessons()
    {
        return $this->hasMany(TutorLesson::class);
    }

    public function availabilitySlots()
    {
        return $this->hasMany(TutorAvailability::class)
            ->orderBy('day_of_week')
            ->orderBy('start_time');
    }

    public function reviews()
    {
        return $this->hasMany(TutorReview::class)->latest();
    }

    public function resumeEntries()
    {
        return $this->hasMany(TutorResumeEntry::class)->orderBy('position')->orderByDesc('id');
    }

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path ? Storage::disk('public')->url($this->photo_path) : null;
    }
}
