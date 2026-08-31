<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One entry in a class's curriculum feed.
 *
 * An assignment and a material are the same row with a different `type`: they
 * share a title, body, attachments and a place in the feed, and only an
 * assignment carries a due date and a score.
 */
class ClassroomItem extends Model
{
    public const TYPES = ['assignment', 'material'];

    use HasFactory;

    protected $fillable = [
        'type',
        'title',
        'description',
        'due_at',
        'allow_late',
        'points',
    ];

    protected $casts = [
        'due_at' => 'datetime',
        'allow_late' => 'boolean',
    ];

    protected $appends = ['is_overdue'];

    public function classroom()
    {
        return $this->belongsTo(Classroom::class);
    }

    public function files()
    {
        return $this->hasMany(ClassroomItemFile::class);
    }

    public function submissions()
    {
        return $this->hasMany(Submission::class);
    }

    /** Derived, so no job has to sweep the table to keep it true. */
    public function getIsOverdueAttribute(): bool
    {
        return $this->type === 'assignment'
            && $this->due_at !== null
            && $this->due_at->isPast();
    }
}
