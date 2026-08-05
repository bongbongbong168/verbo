<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudyQuizQuestion extends Model
{
    use HasFactory;

    protected $fillable = [
        'question',
        'option_a',
        'option_b',
        'option_c',
        'option_d',
        'correct_option',
    ];

    protected $hidden = [
        'correct_option',
    ];

    public function unit()
    {
        return $this->belongsTo(StudyUnit::class, 'study_unit_id');
    }
}
