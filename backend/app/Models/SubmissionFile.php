<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A stored file. Kept on the PRIVATE disk and streamed through an authorised
 * route — student work must not sit behind a URL anyone could guess.
 */
class SubmissionFile extends Model
{
    use HasFactory;

    protected $table = 'submission_files';

    protected $fillable = [
        'submission_id',
        'path',
        'name',
        'mime',
        'size',
    ];

    public function submission()
    {
        return $this->belongsTo(Submission::class);
    }
}
