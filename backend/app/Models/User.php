<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        /* The Google account id. Not secret, but nothing in the client needs
           it, and it is a stable cross-app identifier for a real person — no
           reason to put it on the wire. Whether an account HAS one is exposed
           separately as `has_google`, which is the only part the UI cares
           about. */
        'google_id',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    /**
     * Exposed on every user payload, so a row that renders a face never has to
     * fetch a second thing to find it. Null for an account with no picture —
     * the client falls back to an initial.
     */
    protected $appends = ['avatar_url', 'has_google'];

    /**
     * Is this account linked to Google?
     *
     * The boolean rather than the id itself, so Settings can say "connected"
     * without the identifier ever leaving the server. Also the honest answer
     * to "why can't I change my password?" for an account that only ever
     * signed in with Google.
     */
    public function getHasGoogleAttribute(): bool
    {
        return filled($this->google_id);
    }

    public function getAvatarUrlAttribute(): ?string
    {
        return $this->avatar_path
            ? \Illuminate\Support\Facades\Storage::disk('public')->url($this->avatar_path)
            : null;
    }

    protected $casts = [
        'email_verified_at' => 'datetime',
        'is_admin' => 'boolean',
    ];

    public function flashcards()
    {
        return $this->hasMany(Flashcard::class);
    }

    public function scans()
    {
        return $this->hasMany(Scan::class);
    }

    public function articles()
    {
        return $this->hasMany(Article::class);
    }

    public function podcasts()
    {
        return $this->hasMany(Podcast::class);
    }

    public function studyLevels()
    {
        return $this->hasMany(StudyLevel::class);
    }

    public function activityDays()
    {
        return $this->hasMany(ActivityDay::class);
    }

    /**
     * Everything the user has opened, across modules, newest first. Replaced
     * the study-only studyProgress() relation — the Dashboard's pick-up row
     * mixes units and podcasts in one recency order.
     */
    public function recentViews()
    {
        return $this->hasMany(RecentView::class);
    }

    public function notifications()
    {
        return $this->hasMany(Notification::class);
    }

    /* ---- Read section ---- */

    public function learningPreference()
    {
        return $this->hasOne(LearningPreference::class);
    }

    public function articleLikes()
    {
        return $this->hasMany(ArticleLike::class);
    }

    public function articleBookmarks()
    {
        return $this->hasMany(ArticleBookmark::class);
    }

    public function articleComments()
    {
        return $this->hasMany(ArticleComment::class);
    }

    public function articleViews()
    {
        return $this->hasMany(ArticleView::class);
    }

    /* ---- tutor portal ---- */

    /** Classes this user TEACHES. */
    public function classroomsTeaching()
    {
        return $this->hasMany(Classroom::class);
    }

    /** Classes this user is enrolled in as a student. */
    public function classroomsJoined()
    {
        return $this->belongsToMany(Classroom::class, 'classroom_members')->withTimestamps();
    }

    public function submissions()
    {
        return $this->hasMany(Submission::class);
    }

    public function tutorProfile()
    {
        return $this->hasOne(TutorProfile::class);
    }

    public function bookingsAsStudent()
    {
        return $this->hasMany(Booking::class, 'student_id');
    }

    public function bookingsAsTutor()
    {
        return $this->hasMany(Booking::class, 'tutor_id');
    }
}
