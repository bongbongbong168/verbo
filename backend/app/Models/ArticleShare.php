<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ArticleShare extends Model
{
    use HasFactory;

    protected $table = 'article_shares';

    protected $fillable = [
        'user_id',
        'article_id',
        'platform',
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
