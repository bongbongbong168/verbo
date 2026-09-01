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
        'topic_group',
        'emoji',
    ];

    /**
     * The shelves a Daily Use topic can sit on.
     *
     * A whitelist rather than a free-for-all, so the listing page has a stable
     * set of headings and two topics cannot end up under "Food" and "Food &
     * Drink". Ordered as the page shows them: the situations a learner meets
     * soonest come first.
     *
     * Only meaningful when `category` is 'daily'. An HSK level has no group and
     * is never listed this way.
     */
    public const TOPIC_GROUPS = [
        'Daily Life',
        'Food & Restaurants',
        'Travel',
        'Shopping',
        'Social',
        'Work',
        'Education',
        'Health',
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
