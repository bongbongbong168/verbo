<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * What a user says they want to learn. One row per user.
 *
 * The option lists live here so the API, the validator and the settings UI all
 * read the same source — a hard-coded list in any one of them is how the three
 * drift apart.
 */
class LearningPreference extends Model
{
    use HasFactory;

    public const CHINESE_LEVELS = [
        'Complete Beginner', 'Beginner', 'Intermediate', 'Advanced', 'Not sure',
    ];

    public const HSK_LEVELS = ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];

    public const GOALS = [
        'Speaking & Conversation', 'HSK / Exam Preparation', 'Business Chinese',
        'Travel', 'Study / Education', 'Reading', 'Listening', 'Writing',
        'Everyday Chinese',
    ];

    public const FOCUS = [
        'Speaking', 'Listening', 'Reading', 'Writing', 'Vocabulary', 'Grammar',
        'Pronunciation',
    ];

    public const INTERESTS = [
        'Travel', 'Food', 'Business', 'School', 'Daily Life', 'Culture',
        'Entertainment', 'Shopping', 'Technology',
    ];

    public const STYLES = [
        'Podcasts', 'Articles', 'Stories', 'Videos', 'Quizzes', 'Flashcards',
        'Tutor Lessons',
    ];

    /**
     * How much they mean to study a day.
     *
     * "Whenever I have time" is a real answer, not a cop-out: someone who
     * cannot commit to a number should not be forced to pick one they will
     * then fail to hit.
     */
    public const DAILY_GOALS = [
        '15 minutes', '30 minutes', '45 minutes', '1 hour or more',
        'Whenever I have time',
    ];

    public const STUDY_TIMES = ['Morning', 'Afternoon', 'Evening', 'No preference'];

    protected $fillable = [
        'chinese_level',
        'hsk_level',
        'goals',
        'focus',
        'interests',
        'styles',
        'daily_goal',
        'study_time',
    ];

    protected $casts = [
        'goals' => 'array',
        'focus' => 'array',
        'interests' => 'array',
        'styles' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
