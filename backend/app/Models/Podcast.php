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

    protected $appends = [
        'audio_url',
        'image_url',
    ];

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
