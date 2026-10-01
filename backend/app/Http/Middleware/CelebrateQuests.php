<?php

namespace App\Http\Middleware;

use App\Services\DailyQuests;
use Closure;
use Illuminate\Http\Request;

/**
 * After an action that can finish a daily quest (open an article, save or
 * grade a word, listen, finish a lesson, scan), tell the page if one just
 * finished, so it can show a toast.
 *
 * Rides on the response as a header rather than a new endpoint: no extra
 * request, no polling, and only on the handful of routes that can move a
 * quest. The check is at most three count queries, and it never throws into
 * the action it follows: a failure here must not fail a word save.
 */
class CelebrateQuests
{
    public const HEADER = 'X-Verbo-Quests';

    public function __construct(private DailyQuests $quests)
    {
    }

    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        $user = $request->user();
        if (! $user || $response->getStatusCode() >= 300) {
            return $response;
        }

        try {
            $done = $this->quests->newlyCompleted($user);
            if ($done) {
                $response->headers->set(self::HEADER, json_encode($done));
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return $response;
    }
}
