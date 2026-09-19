<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class TutorProfile extends Model
{
    use HasFactory;

    /**
     * The application's lifecycle.
     *
     * `needs_info` is a real state rather than a rejection with a note: a
     * rejected application is a decision, while "add your certificate and
     * resubmit" is a conversation still in progress, and collapsing the two
     * would tell someone they had failed when they had only been asked a
     * question. Only APPROVED is ever public.
     */
    public const PENDING = 'pending';
    public const APPROVED = 'approved';
    public const REJECTED = 'rejected';
    public const NEEDS_INFO = 'needs_info';

    public const STATUSES = [self::PENDING, self::APPROVED, self::REJECTED, self::NEEDS_INFO];

    /* The option lists ride along in the API response, so the form never keeps
       its own copy — a hard-coded list in the client is how it drifts from what
       the validator accepts. Same pattern as LearningPreference. */
    public const CHINESE_LEVELS = [
        'Native speaker',
        'Near-native',
        'Advanced (HSK 6)',
        'Upper-intermediate (HSK 5)',
        'Intermediate (HSK 4)',
    ];

    public const TEACHES_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'HSK preparation'];

    /**
     * Teaching specialties a tutor can claim, keyed by a stable slug.
     *
     * A FIXED LIST, not free text: a learner can only compare tutors, and a
     * future filter can only match them, if two tutors who both teach HSK
     * preparation call it the same thing. The description is written once
     * here so every profile explains a specialty the same way. Ships in the
     * API as options so no client keeps its own copy.
     */
    public const SPECIALTIES = [
        'conversational' => ['label' => 'Conversational Chinese', 'emoji' => '🗣️', 'blurb' => 'Practice natural conversations and build everyday speaking confidence.'],
        'speaking' => ['label' => 'Speaking Practice', 'emoji' => '💬', 'blurb' => 'Build fluency through guided conversation and live correction.'],
        'hsk' => ['label' => 'HSK Preparation', 'emoji' => '📚', 'blurb' => 'Prepare for HSK exams with structured lessons, vocabulary and practice tests.'],
        'everyday' => ['label' => 'Everyday Chinese', 'emoji' => '🏙️', 'blurb' => 'Useful Chinese for daily situations and real conversations.'],
        'travel' => ['label' => 'Travel Chinese', 'emoji' => '✈️', 'blurb' => 'Phrases and conversations for getting around Chinese-speaking places.'],
        'pronunciation' => ['label' => 'Pronunciation', 'emoji' => '🔊', 'blurb' => 'Improve tones, pronunciation and speaking accuracy.'],
    ];

    /** The option list as the client wants it: an ordered array, key included. */
    public static function specialtyOptions(): array
    {
        return collect(self::SPECIALTIES)
            ->map(fn ($s, $key) => ['key' => $key] + $s)
            ->values()
            ->all();
    }

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
        // Application fields. `status`, `reviewed_by` and the timestamps are
        // deliberately NOT fillable — a decision about an application must not
        // be settable by whatever the applicant happens to post.
        'country',
        'chinese_level',
        'teaches_levels',
        'years_experience',
        'teaching_style',
        'specialties',
        'main_specialty',
    ];

    protected $casts = [
        'teaches_levels' => 'array',
        'specialties' => 'array',
        'submitted_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'allows_pre_booking_questions' => 'boolean',
    ];

    protected $appends = [
        'photo_url',
    ];

    /**
     * Only approved profiles are public. Every listing goes through this.
     *
     * Written as a scope rather than a `where` repeated at each call site,
     * because the cost of forgetting it once is an unreviewed tutor appearing
     * in the marketplace — which is the entire thing this feature prevents.
     */
    public function scopeApproved($query)
    {
        return $query->where('status', self::APPROVED);
    }

    public function scopeAwaitingReview($query)
    {
        return $query->whereIn('status', [self::PENDING, self::NEEDS_INFO]);
    }

    public function getIsPublicAttribute(): bool
    {
        return $this->status === self::APPROVED;
    }

    /** Evidence attached to the application — never exposed publicly. */
    public function credentials()
    {
        return $this->hasMany(TutorCredential::class)->latest('id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

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
