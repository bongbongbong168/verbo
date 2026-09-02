<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Podcast extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'audio_path',
        'image_path',
        'transcript',
        'transcript_en',
        'level',
        'bio',
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
     * Timed transcript lines. Ordered by `position` rather than `start_ms`
     * because a line whose time has not been stamped yet still has a place in
     * the transcript, and ordering by an unset time would move it to the top.
     */
    public function cues()
    {
        return $this->hasMany(PodcastCue::class)->orderBy('position');
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
