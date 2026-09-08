<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One piece of evidence on a tutor application.
 *
 * There is deliberately no `url` accessor here, unlike `Article::image_url` or
 * `TutorProfile::photo_url`. Those live on the public disk and are meant to be
 * linked; this file is on the private disk and may only be reached through a
 * route that re-checks who is asking. An accessor would make it one careless
 * `->toArray()` away from being handed to the browser.
 */
class TutorCredential extends Model
{
    use HasFactory;

    protected $fillable = [
        'label',
        'name',
        'mime',
        'size',
        // `path` is NOT fillable: only the upload endpoint may decide where a
        // file lives, because that endpoint also owns deleting it.
    ];

    protected $casts = [
        'size' => 'integer',
    ];

    public function tutorProfile()
    {
        return $this->belongsTo(TutorProfile::class);
    }
}
