<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudyTextLine extends Model
{
    use HasFactory;

    protected $fillable = [
        'speaker',
        'chinese',
        'pinyin',
        'position',
    ];

    public function text()
    {
        return $this->belongsTo(StudyText::class, 'study_text_id');
    }
}
