<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class StudyCultureImage extends Model
{
    use HasFactory;

    protected $fillable = [
        'path',
        'position',
    ];

    // Same appended-accessor pattern as Article::image_url — the raw path is
    // never what the frontend wants.
    protected $appends = ['url'];

    public function getUrlAttribute()
    {
        return $this->path ? Storage::disk('public')->url($this->path) : null;
    }

    public function unit()
    {
        return $this->belongsTo(StudyUnit::class, 'study_unit_id');
    }
}
