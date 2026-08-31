<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A stored file. Kept on the PRIVATE disk and streamed through an authorised
 * route — student work must not sit behind a URL anyone could guess.
 */
class ClassroomItemFile extends Model
{
    use HasFactory;

    protected $table = 'classroom_item_files';

    protected $fillable = [
        'classroom_item_id',
        'path',
        'name',
        'mime',
        'size',
    ];

    public function classroomItem()
    {
        return $this->belongsTo(ClassroomItem::class);
    }
}
