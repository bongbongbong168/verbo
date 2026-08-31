<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ArticleBookmark extends Model
{
    use HasFactory;

    protected $table = 'article_bookmarks';

    protected $fillable = [
        'user_id',
        'article_id',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function article()
    {
        return $this->belongsTo(Article::class);
    }
}
