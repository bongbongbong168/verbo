<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Article extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'title',
        'type',
        'body',
        'body_en',
        'image_path',
        'hsk_level',
        'difficulty',
        'category',
    ];

    protected $appends = [
        'image_url',
        'reading_minutes',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function getImageUrlAttribute(): ?string
    {
        return $this->image_path ? Storage::disk('public')->url($this->image_path) : null;
    }

    /**
     * Estimated reading time, DERIVED rather than stored.
     *
     * A column would go stale the first time someone edited the body. Chinese
     * is counted per character (~300/min is a common learner-reading pace) and
     * anything non-Han per word, so a mixed article is not wildly over-counted.
     * Always at least 1 — "0 min read" reads as broken.
     */
    public function getReadingMinutesAttribute(): int
    {
        /* index() selects a body_length instead of the body itself, so the card
           list can show a reading time without shipping every article's text
           across the wire. Without this branch every card would read "1 min",
           because the accessor would be measuring a body that was never
           loaded. */
        if (! array_key_exists('body', $this->attributes)
            && isset($this->attributes['body_length'])) {
            return max(1, (int) ceil(((int) $this->attributes['body_length']) / 300));
        }

        $body = (string) $this->body;

        $han = preg_match_all('/\p{Han}/u', $body) ?: 0;
        $rest = preg_split('/\s+/u', preg_replace('/\p{Han}/u', ' ', $body), -1, PREG_SPLIT_NO_EMPTY);

        $minutes = ($han / 300) + (count($rest) / 200);

        return max(1, (int) ceil($minutes));
    }

    public function tags()
    {
        return $this->hasMany(ArticleTag::class);
    }

    public function likes()
    {
        return $this->hasMany(ArticleLike::class);
    }

    public function bookmarks()
    {
        return $this->hasMany(ArticleBookmark::class);
    }

    /** Top-level comments only; replies hang off each one. */
    public function comments()
    {
        return $this->hasMany(ArticleComment::class)->whereNull('parent_id');
    }

    public function allComments()
    {
        return $this->hasMany(ArticleComment::class);
    }

    public function views()
    {
        return $this->hasMany(ArticleView::class);
    }

    public function shares()
    {
        return $this->hasMany(ArticleShare::class);
    }
}
