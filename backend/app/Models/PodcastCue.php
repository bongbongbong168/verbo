<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PodcastCue extends Model
{
    use HasFactory;

    protected $fillable = [
        'position',
        'start_ms',
        'text',
    ];

    /* `podcast_id` is deliberately absent above — cues are only ever created
       through `$podcast->cues()`, which sets the key directly. Mass assignment
       would silently drop it, the way it has elsewhere on this project. */

    protected $casts = [
        'position' => 'integer',
        'start_ms' => 'integer',
    ];

    public function podcast()
    {
        return $this->belongsTo(Podcast::class);
    }
}
