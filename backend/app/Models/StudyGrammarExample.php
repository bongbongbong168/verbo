<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudyGrammarExample extends Model
{
    use HasFactory;

    protected $fillable = [
        'chinese',
        'pinyin',
        'english',
        'position',
    ];

    public function grammarPoint()
    {
        return $this->belongsTo(StudyGrammarPoint::class, 'study_grammar_point_id');
    }
}
