<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A comment on a podcast episode, or a reply to one. Same rules as
 * ArticleComment: replies are one level deep, enforced by the controller.
 */
class PodcastComment extends Model
{
    protected $fillable = [
        'user_id',
        'podcast_id',
        'parent_id',
        'content',
    ];

    protected $appends = ['edited'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function podcast()
    {
        return $this->belongsTo(Podcast::class);
    }

    public function replies()
    {
        return $this->hasMany(self::class, 'parent_id')->oldest('id');
    }

    public function getEditedAttribute(): bool
    {
        return $this->updated_at && $this->created_at
            && $this->updated_at->gt($this->created_at->addSecond());
    }
}
