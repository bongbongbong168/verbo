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

    public const TEACHES_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels'];

    public const TEACHING_LANGUAGES = ['Mandarin', 'English', 'Khmer', 'French', 'Japanese', 'Korean', 'Spanish', 'Other'];

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
        'conversational' => ['label' => 'Conversation'],
        'speaking' => ['label' => 'Conversation'],
        'hsk' => ['label' => 'HSK Prep'],
        'everyday' => ['label' => 'Daily Chinese'],
        'travel' => ['label' => 'Travel Chinese'],
        'pronunciation' => ['label' => 'Pronunciation'],
        'grammar' => ['label' => 'Grammar'],
        'business' => ['label' => 'Business Chinese'],
        'exam' => ['label' => 'Exam Prep'],
        'kids' => ['label' => 'Kids'],
    ];

    /** The option list as the client wants it: an ordered array, key included. */
    public static function specialtyOptions(): array
    {
        return collect(['hsk', 'conversational', 'pronunciation', 'grammar', 'business', 'travel', 'everyday', 'exam', 'kids'])
            ->mapWithKeys(fn ($key) => [$key => self::SPECIALTIES[$key]])
            ->map(fn ($s, $key) => ['key' => $key] + $s)
            ->values()
            ->all();
    }

    /**
     * This tutor's specialties, resolved for display and main one first, so no
     * client needs the option list just to print a label. Keys no longer in
     * the list are dropped rather than shown as raw slugs.
     *
     * It lives here because BOTH the profile page and the card listings want
     * it — it was written out inside `showProfile` and the Dashboard's cards
     * would have been the second copy.
     */
    public function specialtyList(): array
    {
        return collect($this->specialties ?? [])
            ->filter(fn ($key) => isset(self::SPECIALTIES[$key]))
            ->sortBy(fn ($key) => $key === $this->main_specialty ? 0 : 1)
            ->map(fn ($key) => ['key' => $key, 'main' => $key === $this->main_specialty] + self::SPECIALTIES[$key])
            /* `conversational` and `speaking` share the label "Conversation",
               so a tutor with both showed it twice. One card per label; the
               sort above keeps the main one. */
            ->unique('label')
            ->values()
            ->all();
    }

    protected $fillable = [
        'bio',
        'short_bio',
        'subjects',
        'hourly_rate',
        'photo_path',
        'languages_spoken',
        'availability',
        'video_url',
        'video_id',
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
        'teaching_languages',
        'specialties',
        'main_specialty',
    ];

    protected $casts = [
        'teaches_levels' => 'array',
        'teaching_languages' => 'array',
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

    /**
     * What the tutor's REAL weekly hours say, for cards and the filter.
     *
     * Replaces the free-text `availability` line, which created no bookable
     * time and could say anything. Built from `availabilitySlots` (load it
     * first), wall-clock in the tutor's own timezone like the rows themselves.
     *
     * @return array{summary: ?string, bands: array<int, string>}
     *   summary: "Mon–Fri · 9am–7pm", or null with no hours set.
     *   bands: which of morning (<12) / afternoon (12–17) / evening (17+) any
     *   opening touches - what Find Tutor filters on.
     */
    public function hoursSummary(): array
    {
        $rows = $this->availabilitySlots;
        if ($rows->isEmpty()) {
            return ['summary' => null, 'bands' => []];
        }

        $mins = fn ($t) => ((int) substr($t, 0, 2)) * 60 + (int) substr($t, 3, 2);
        $start = $rows->min(fn ($r) => $mins($r->start_time));
        $end = $rows->max(fn ($r) => $mins($r->end_time));

        $bands = [];
        foreach (['morning' => [0, 720], 'afternoon' => [720, 1020], 'evening' => [1020, 1440]] as $band => [$from, $to]) {
            if ($rows->contains(fn ($r) => $mins($r->start_time) < $to && $mins($r->end_time) > $from)) {
                $bands[] = $band;
            }
        }

        // Monday-first week, runs of 3+ days collapsed: "Mon–Fri", "Sat, Sun".
        $names = [1 => 'Mon', 2 => 'Tue', 3 => 'Wed', 4 => 'Thu', 5 => 'Fri', 6 => 'Sat', 0 => 'Sun'];
        $order = array_keys($names);
        $days = $rows->pluck('day_of_week')->map(fn ($d) => (int) $d)->unique()
            ->sortBy(fn ($d) => array_search($d, $order))->values()->all();
        $groups = [];
        foreach ($days as $d) {
            $pos = array_search($d, $order);
            if ($groups && end($groups)[1] === $pos - 1) {
                $groups[count($groups) - 1][1] = $pos;
            } else {
                $groups[] = [$pos, $pos];
            }
        }
        $dayText = collect($groups)->map(function ($g) use ($order, $names) {
            [$a, $b] = $g;
            if ($b - $a >= 2) {
                return $names[$order[$a]].'–'.$names[$order[$b]];
            }

            return collect(range($a, $b))->map(fn ($p) => $names[$order[$p]])->implode(', ');
        })->implode(', ');

        $clock = function (int $m) {
            $m %= 1440;
            $h = intdiv($m, 60);
            $suffix = $h < 12 ? 'am' : 'pm';
            $h12 = $h % 12 ?: 12;

            return $h12.($m % 60 ? ':'.str_pad($m % 60, 2, '0', STR_PAD_LEFT) : '').$suffix;
        };

        return ['summary' => $dayText.' · '.$clock($start).'–'.$clock($end), 'bands' => $bands];
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
