<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TutorReview extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'rating',
        'body',
    ];

    protected $casts = [
        'rating' => 'integer',
    ];

    protected $appends = ['author_photo_url'];

    /**
     * The reviewer's face.
     *
     * Same rule as a message row and a notification: the account's own picture
     * wins, a tutor's marketing photo is the fallback so seeded tutors still
     * show a face, and null means the client draws an initial instead.
     *
     * Exposed as one flat field rather than leaving the client to dig through
     * `user.tutor_profile.photo_url` — that path depends on Laravel's
     * snake-casing of relation keys, which is exactly the kind of detail a
     * component should not have to know.
     *
     * Relies on `user` (and `user.tutorProfile`) being eager-loaded; the
     * controller does that, or this fires two queries per review.
     */
    public function getAuthorPhotoUrlAttribute(): ?string
    {
        return $this->user?->avatar_url ?? $this->user?->tutorProfile?->photo_url;
    }

    public function tutorProfile()
    {
        return $this->belongsTo(TutorProfile::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
