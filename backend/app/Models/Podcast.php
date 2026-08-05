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
