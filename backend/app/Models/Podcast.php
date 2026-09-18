<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Podcast extends Model
{
    use HasFactory;

    /**
     * The topics an episode can be filed under.
     *
     * A TOPIC, not a difficulty — `level` already answers "how hard is this",
     * and mixing the two into one list is what once put "Grammar" beside
     * "Entertainment" on the Read page as though a reader were choosing
     * between them. The first six are deliberately the same words Read shelves
     * by, so a learner meets one vocabulary across the app rather than two;
     * Technology and Society are added because audio here actually covers them
     * and neither has a natural home in Read's set.
     *
     * Held on the model so the validator and the client read the same list —
     * a copy hard-coded in the frontend is how the two drift apart.
     */
    public const CATEGORIES = [
        'Everyday Chinese',
        'Culture',
        'Travel',
        'Business',
        'Technology',
        'Society',
    ];

    protected $fillable = [
        'title',
        'audio_path',
        'image_path',
        'transcript',
        'transcript_en',
        'level',
        'category',
        'bio',
        'host',
    ];

    /* The timed transcript and its state are NOT fillable: only the import
       path (TimedTranscriptController / podcast:transcribe) may write them,
       so the ordinary episode form can never blank one by omission. */

    /* Never in the episode payload. It can run to hundreds of KB, and the
       episode is loaded far more often than the synced view is - it has its
       own endpoint. The error is admin-facing and also has its own route. */
    protected $hidden = [
        'timed_transcript',
        'timed_transcript_error',
    ];

    protected $casts = [
        'timed_transcript' => 'array',
        'timed_transcript_at' => 'datetime',
    ];

    public const TIMED_STATUSES = ['not_processed', 'processing', 'completed', 'failed'];

    protected $appends = [
        'audio_url',
        'image_url',
    ];

    /* The only three ways the timed transcript changes. forceFill because
       none of these columns are fillable, on purpose - see above.

       None of them bump updated_at. That column means "the episode was
       edited", and the episode page keys its edit drawer on it, so an import
       stamping it remounted the drawer and threw the admin back to the first
       tab. */
    public function saveTimedTranscript(array $transcript): void
    {
        $this->forceFill([
            'timed_transcript' => $transcript,
            'timed_transcript_status' => 'completed',
            'timed_transcript_error' => null,
            'timed_transcript_at' => now(),
        ])->saveWithoutTouching();
    }

    public function markTimedTranscript(string $status, ?string $error = null): void
    {
        $this->forceFill([
            'timed_transcript_status' => $status,
            'timed_transcript_error' => $error,
        ])->saveWithoutTouching();
    }

    public function clearTimedTranscript(): void
    {
        $this->forceFill([
            'timed_transcript' => null,
            'timed_transcript_status' => 'not_processed',
            'timed_transcript_error' => null,
            'timed_transcript_at' => null,
        ])->saveWithoutTouching();
    }

    private function saveWithoutTouching(): void
    {
        $this->timestamps = false;
        try {
            $this->save();
        } finally {
            $this->timestamps = true;
        }
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Points at the streaming route, not the raw storage path, so the player
     * gets Range support (seeking). See PodcastController::audio.
     */
    public function getAudioUrlAttribute(): ?string
    {
        return $this->audio_path ? url('/api/podcasts/'.$this->id.'/audio') : null;
    }

    public function getImageUrlAttribute(): ?string
    {
        return $this->image_path ? Storage::disk('public')->url($this->image_path) : null;
    }
}
