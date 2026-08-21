<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudyProgress extends Model
{
    use HasFactory;

    protected $table = 'study_progress';

    protected $fillable = [
        'study_unit_id',
        'last_viewed_at',
    ];

    protected $casts = [
        'last_viewed_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function studyUnit()
    {
        return $this->belongsTo(StudyUnit::class);
    }
}
