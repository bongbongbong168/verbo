<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudyGrammarPoint extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'structure',
        'examples',
    ];

    public function unit()
    {
        return $this->belongsTo(StudyUnit::class, 'study_unit_id');
    }
}
