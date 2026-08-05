<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudyVocabulary extends Model
{
    use HasFactory;

    protected $fillable = [
        'hanzi',
        'pinyin',
        'translation',
    ];

    public function unit()
    {
        return $this->belongsTo(StudyUnit::class, 'study_unit_id');
    }
}
