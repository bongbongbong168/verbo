<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TutorLesson extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'price',
        'duration_minutes',
        'is_trial',
    ];

    protected $casts = [
        'price' => 'integer',
        'duration_minutes' => 'integer',
        'is_trial' => 'boolean',
    ];

    public function tutorProfile()
    {
        return $this->belongsTo(TutorProfile::class);
    }

    /**
     * Lessons that can stand for "what this tutor costs".
     *
     * Two exclusions, and the second is the one worth defending:
     *
     * - No free or unpriced rows. "From $0" is not a price.
     * - No TRIALS. A trial is limited to one per student and is deliberately
     *   discounted — one tutor here offers a $5 trial against $22 for the same
     *   length of regular lesson. Advertising $5 as the price would be quoting
     *   a number you can pay exactly once, which is the kind of thing that
     *   reads as a bait price rather than an honest one.
     *
     * One definition, because the list card, the profile card and the price
     * filter all have to agree about what a tutor costs.
     */
    public function scopeBookablePriced($query)
    {
        return $query->where('is_trial', false)->whereNotNull('price')->where('price', '>', 0);
    }
}
