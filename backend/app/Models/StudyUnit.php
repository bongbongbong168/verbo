<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudyUnit extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'lesson_label',
        'description',
        'reading',
        'culture_title',
        'culture_body',
        'culture_term',
        'culture_term_pinyin',
    ];

    public function level()
    {
        return $this->belongsTo(StudyLevel::class, 'study_level_id');
    }

    public function texts()
    {
        return $this->hasMany(StudyText::class)->orderBy('position')->orderBy('id');
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

    public function cultureImages()
    {
        return $this->hasMany(StudyCultureImage::class)->orderBy('position')->orderBy('id');
    }
}
