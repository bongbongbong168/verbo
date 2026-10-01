<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContentQuiz extends Model
{
    protected $fillable = ['quizzable_type', 'quizzable_id', 'questions', 'source_hash'];

    protected $casts = ['questions' => 'array'];
}
