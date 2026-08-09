<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class StudyLevel extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'level_label',
        'image_path',
        'banner_path',
        'accent_color',
        'category',
    ];

    protected $appends = [
        'image_url',
        'banner_url',
    ];

    public function getImageUrlAttribute(): ?string
    {
        return $this->image_path ? Storage::disk('public')->url($this->image_path) : null;
    }

    public function getBannerUrlAttribute(): ?string
    {
        return $this->banner_path ? Storage::disk('public')->url($this->banner_path) : null;
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function units()
    {
        return $this->hasMany(StudyUnit::class);
    }
}
