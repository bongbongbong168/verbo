<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudyText extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'position',
    ];

    public function unit()
    {
        return $this->belongsTo(StudyUnit::class, 'study_unit_id');
    }

    public function lines()
    {
        return $this->hasMany(StudyTextLine::class)->orderBy('position')->orderBy('id');
    }
}
