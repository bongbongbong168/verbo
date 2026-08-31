<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A comment on an article, or a reply to one.
 *
 * Replies are ONE level deep: `parent_id` is null for a top-level comment and
 * points at a top-level comment for a reply. The controller refuses to let a
 * reply become a parent, which is what keeps this from growing into an
 * unbounded tree nobody can render.
 */
class ArticleComment extends Model
{
    use HasFactory;

    protected $table = 'article_comments';

    protected $fillable = [
        'user_id',
        'article_id',
        'parent_id',
        'content',
    ];

    protected $appends = ['edited'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function article()
    {
        return $this->belongsTo(Article::class);
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function replies()
    {
        return $this->hasMany(self::class, 'parent_id')->oldest('id');
    }

    /** So the UI can mark an edited comment without comparing timestamps itself. */
    public function getEditedAttribute(): bool
    {
        return $this->updated_at && $this->created_at
            && $this->updated_at->gt($this->created_at->addSecond());
    }
}
