<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudyUnit extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'reading',
        'culture_title',
        'culture_body',
    ];

    public function level()
    {
        return $this->belongsTo(StudyLevel::class, 'study_level_id');
    }

    public function vocabulary()
    {
        return $this->hasMany(StudyVocabulary::class);
    }

    public function grammarPoints()
    {
        return $this->hasMany(StudyGrammarPoint::class);
    }

    public function quizQuestions()
    {
        return $this->hasMany(StudyQuizQuestion::class);
    }
}
