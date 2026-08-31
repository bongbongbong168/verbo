<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClassroomMember extends Model
{
    use HasFactory;

    protected $fillable = ['user_id', 'joined_at'];

    protected $casts = ['joined_at' => 'datetime'];

    public function classroom()
    {
        return $this->belongsTo(Classroom::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
