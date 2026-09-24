<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One word in a user's Vocabulary Bank.
 *
 * Every module that shows Chinese saves here — Read, Podcast, Scan, Study and
 * the manual add — which is the cross-module idea the whole product is built
 * on. A word met in two places is still ONE row (see FlashcardController::store).
 */
class Flashcard extends Model
{
    use HasFactory;

    /**
     * The kind of place a word came from, keyed by the value stored in
     * `source_module`. The label is what the filter strip reads, so the
     * vocabulary lives here rather than being restated in the client.
     */
    public const MODULES = [
        'podcast' => 'Podcasts',
        'read' => 'Reading',
        'study' => 'Modules',
        'scan' => 'Scanned',
        'manual' => 'Added by you',
    ];

    /**
     * How many consecutive correct answers make a word "mastered".
     *
     * A streak, not a total: getting one right out of ten says nothing, and a
     * total would let a word you keep forgetting graduate anyway. Three in a
     * row is a deliberate, statable rule — the page says so on screen, so the
     * number can be defended rather than felt.
     */
    public const MASTERED_STREAK = 3;

    protected $fillable = [
        'user_id',
        'word',
        'pinyin',
        'translation',
        'source_module',
        'source_type',
        'source_id',
        'example',
        'card_type',
    ];

    /**
     * SQLite does not round-trip column defaults through `create()`, so a new
     * card would come back with nulls where the database has zeros and every
     * counter would need a `?? 0` at its call sites. Setting them here fixes it
     * once — the same trap `source_module` and `Booking.status` hit.
     */
    protected $attributes = [
        'card_type' => 'word',
        'review_count' => 0,
        'correct_streak' => 0,
        'lapses' => 0,
    ];

    protected $casts = [
        'review_count' => 'integer',
        'correct_streak' => 'integer',
        'lapses' => 'integer',
        'last_reviewed_at' => 'datetime',
        // First right answer: what "learn a word" counts for the daily quest.
        'first_correct_at' => 'datetime',
    ];

    protected $appends = ['is_mastered', 'is_difficult'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /** The article / episode / unit / scan the word was met in, when known. */
    public function source()
    {
        return $this->morphTo('source');
    }

    public function getIsMasteredAttribute(): bool
    {
        return $this->correct_streak >= self::MASTERED_STREAK;
    }

    /**
     * Forgotten at least once and not yet mastered.
     *
     * Mastery has to win: a word you used to trip on but have now answered
     * right three times running is no longer the one to drill.
     */
    public function getIsDifficultAttribute(): bool
    {
        return $this->lapses > 0 && ! $this->is_mastered;
    }
}
