<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PodcastProgress extends Model
{
    use HasFactory;

    /** Laravel would guess `podcast_progresses`; the table is a mass noun. */
    protected $table = 'podcast_progress';

    /**
     * How close to the end counts as finished.
     *
     * Podcasts nearly always end with a sign-off nobody listens through, and an
     * episode left at 99% would otherwise sit in "continue listening" forever
     * with nothing left to hear.
     */
    public const FINISHED_WITHIN_SECONDS = 20;

    /**
     * Below this, there is nothing worth resuming from.
     *
     * Opening an episode, hearing five seconds and leaving is not a position —
     * jumping someone back to 0:04 next time is noise dressed up as a feature.
     */
    public const RESUME_FLOOR_SECONDS = 15;

    protected $fillable = [
        'user_id',
        'podcast_id',
        'position_seconds',
        'duration_seconds',
        'completed_at',
    ];

    protected $casts = [
        'position_seconds' => 'integer',
        'duration_seconds' => 'integer',
        'completed_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function podcast()
    {
        return $this->belongsTo(Podcast::class);
    }

    /** Is there a position worth sending someone back to? */
    public function getIsResumableAttribute(): bool
    {
        return $this->completed_at === null
            && $this->position_seconds >= self::RESUME_FLOOR_SECONDS;
    }
}
