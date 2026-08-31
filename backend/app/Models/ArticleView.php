<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ArticleView extends Model
{
    use HasFactory;

    protected $table = 'article_views';

    protected $fillable = [
        'user_id',
        'article_id',
        'views',
        'last_viewed_at',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function article()
    {
        return $this->belongsTo(Article::class);
    }

    protected $casts = [
        'last_viewed_at' => 'datetime',
    ];
}
