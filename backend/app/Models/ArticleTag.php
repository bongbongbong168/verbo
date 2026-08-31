<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One learning tag on an article. `kind` is what makes it scoreable — a
 * "Travel" interest and a "Speaking" focus are worth different points, so the
 * recommender has to be able to tell them apart.
 */
class ArticleTag extends Model
{
    use HasFactory;

    /** The tag kinds the recommender knows how to score. */
    public const KINDS = ['goal', 'focus', 'interest', 'style', 'topic'];

    protected $fillable = [
        'article_id',
        'kind',
        'value',
    ];

    public function article()
    {
        return $this->belongsTo(Article::class);
    }
}
