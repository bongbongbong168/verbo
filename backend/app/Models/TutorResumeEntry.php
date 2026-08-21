<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TutorResumeEntry extends Model
{
    use HasFactory;

    /** The tabs the Resume block renders, in order. */
    public const SECTIONS = ['Education', 'Certifications'];

    protected $fillable = [
        'section',
        'years',
        'title',
        'detail',
        'position',
    ];

    public function tutorProfile()
    {
        return $this->belongsTo(TutorProfile::class);
    }
}
