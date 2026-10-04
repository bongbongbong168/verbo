<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A student hiding a finished tutor from their Profile's "My Tutors". */
class HiddenTutor extends Model
{
    protected $fillable = ['user_id', 'tutor_id'];
}
