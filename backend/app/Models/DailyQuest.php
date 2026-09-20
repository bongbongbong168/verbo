<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One area's quest for one day. Progress is NOT here - it is counted from
 * the rows the app already writes (see App\Services\DailyQuests).
 */
class DailyQuest extends Model
{
    protected $fillable = ['user_id', 'day', 'area', 'quest_key', 'level', 'changes_used'];

    protected $casts = ['changes_used' => 'integer'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
