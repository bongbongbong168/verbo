<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One student's work on one assignment.
 *
 * This row is the whole point of the portal: it binds the file to a student and
 * an assignment by foreign key, so the filename never has to be trusted or
 * parsed. "final_final_REAL.docx" is still unambiguously Lina's HSK 3 writing.
 */
class Submission extends Model
{
    use HasFactory;

    protected $fillable = [
        'classroom_item_id',
        'user_id',
        'note',
        'submitted_at',
        'is_late',
        'score',
        'feedback',
        'graded_at',
        'graded_by',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
        'graded_at' => 'datetime',
        'is_late' => 'boolean',
    ];

    protected $appends = ['status'];

    public function item()
    {
        return $this->belongsTo(ClassroomItem::class, 'classroom_item_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function files()
    {
        return $this->hasMany(SubmissionFile::class);
    }

    /**
     * Derived from what actually happened, never stored: a status column would
     * be one more thing to keep in step with the timestamps beside it.
     */
    public function getStatusAttribute(): string
    {
        if ($this->graded_at) {
            return 'graded';
        }

        return $this->submitted_at ? 'submitted' : 'draft';
    }
}
