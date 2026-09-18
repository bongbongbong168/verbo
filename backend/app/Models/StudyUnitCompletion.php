<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StudyUnitCompletion extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'study_unit_id', 'completed_at'];

    protected $casts = ['completed_at' => 'datetime'];
}
