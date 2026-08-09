<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Scan extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'original_filename',
        'raw_text',
        'words',
        'size_bytes',
    ];

    protected $casts = [
        'words' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
