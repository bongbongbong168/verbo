<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Seconds actually listened, per day, credited server-side from the gap
 * between two position reports (PodcastController::saveProgress).
 */
class PodcastListenDay extends Model
{
    /* The most one report may credit. The page reports every 15s while
       playing, so a bigger gap means the tab was hidden, the listener
       seeked, or someone is posting numbers by hand - none of which is
       listening. Same clamp, and same reason, as the activity heartbeat. */
    public const MAX_CREDIT_SECONDS = 20;

    protected $fillable = ['user_id', 'day', 'seconds'];

    protected $casts = ['seconds' => 'integer'];

    public static function credit(int $userId, int $seconds): void
    {
        $seconds = max(0, min($seconds, self::MAX_CREDIT_SECONDS));
        if ($seconds === 0) {
            return;
        }

        // `day` is a plain Y-m-d string: a date cast writes back
        // "Y-m-d 00:00:00" and firstOrCreate then never matches.
        $row = static::firstOrCreate(
            ['user_id' => $userId, 'day' => Carbon::today()->toDateString()],
            ['seconds' => 0]
        );
        $row->increment('seconds', $seconds);
    }

    public static function secondsToday(int $userId): int
    {
        return (int) static::where('user_id', $userId)
            ->where('day', Carbon::today()->toDateString())
            ->value('seconds');
    }
}
