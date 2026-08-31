<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityDay;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ActivityController extends Controller
{
    /**
     * How long a heartbeat may credit. The client beats once a minute, so a gap
     * bigger than this means the tab was hidden, asleep or closed — that time
     * was not spent studying and is dropped rather than back-filled.
     */
    private const MAX_GAP_SECONDS = 120;

    /**
     * Record that the user is still active.
     *
     * The duration is computed server-side from the gap between beats and is
     * never taken from the request: a client-supplied number could be inflated
     * at will, and "hours spent" is the one figure on the Dashboard a user
     * might be tempted to game. The first beat of a day credits nothing — there
     * is no previous timestamp to measure from — so a session is only ever
     * under-counted by one interval, never over.
     */
    public function heartbeat(Request $request)
    {
        $now = Carbon::now();

        $row = $request->user()->activityDays()->firstOrCreate(
            ['day' => $now->toDateString()],
            ['seconds' => 0, 'last_beat_at' => null]
        );

        $credited = 0;

        if ($row->last_beat_at) {
            $gap = $row->last_beat_at->diffInSeconds($now);
            // Clamp, and ignore a clock that has gone backwards.
            $credited = $gap > 0 && $gap <= self::MAX_GAP_SECONDS ? $gap : 0;
        }

        $row->update([
            'seconds' => $row->seconds + $credited,
            'last_beat_at' => $now,
        ]);

        return response()->json([
            'credited_seconds' => $credited,
            'today_seconds' => $row->seconds,
        ]);
    }

    /**
     * Consecutive days the user has opened Verbo, ending today or yesterday.
     *
     * A day counts if it has an activity row at all, not if it clears some
     * minimum — a streak rewards showing up, and the first heartbeat of a day
     * credits 0 seconds by design, so a threshold would deny credit to someone
     * who genuinely turned up for a short visit.
     *
     * Yesterday is allowed as the endpoint so the badge does not read 0 for the
     * whole morning before the user has opened the app; the run only breaks
     * once a full day has been missed.
     *
     * Days are bucketed by the app timezone, the same one the heartbeat writes
     * with, so the two can never disagree about where a day ends.
     */
    private function streaks($user): array
    {
        // Bounded: more than a year of history cannot change a current streak,
        // and this keeps the query from growing without limit.
        $dates = $user->activityDays()
            ->orderByDesc('day')
            ->limit(400)
            ->pluck('day')
            ->map(fn ($d) => Carbon::parse($d)->startOfDay())
            ->values();

        if ($dates->isEmpty()) {
            return ['current' => 0, 'longest' => 0];
        }

        $today = Carbon::today();
        $daysSinceLast = $dates[0]->diffInDays($today, false);

        // Longest run anywhere in the history, walking the descending list.
        $longest = 1;
        $run = 1;
        for ($i = 1; $i < $dates->count(); $i++) {
            if ($dates[$i - 1]->diffInDays($dates[$i]) === 1) {
                $run++;
                $longest = max($longest, $run);
            } else {
                $run = 1;
            }
        }

        // The current run only counts if it reaches today or yesterday.
        $current = 0;
        if ($daysSinceLast >= 0 && $daysSinceLast <= 1) {
            $current = 1;
            for ($i = 1; $i < $dates->count(); $i++) {
                if ($dates[$i - 1]->diffInDays($dates[$i]) !== 1) {
                    break;
                }
                $current++;
            }
        }

        return ['current' => $current, 'longest' => max($longest, $current)];
    }

    /**
     * The Dashboard's activity chart: one bucket per day for the last week,
     * including days with no activity so the chart keeps seven bars.
     */
    public function summary(Request $request)
    {
        $days = (int) $request->query('days', 7);
        $days = max(1, min($days, 31));

        $start = Carbon::today()->subDays($days - 1);

        $rows = $request->user()->activityDays()
            ->where('day', '>=', $start->toDateString())
            ->pluck('seconds', 'day');

        // pluck() keys come back as the raw column value; normalise so the
        // lookup below cannot miss on a datetime-vs-date formatting difference.
        $byDay = [];
        foreach ($rows as $day => $seconds) {
            $byDay[Carbon::parse($day)->toDateString()] = (int) $seconds;
        }

        $buckets = [];
        for ($i = 0; $i < $days; $i++) {
            $date = $start->copy()->addDays($i);
            $seconds = $byDay[$date->toDateString()] ?? 0;
            $buckets[] = [
                'date' => $date->toDateString(),
                'label' => $date->format('D'),
                'seconds' => $seconds,
                'hours' => round($seconds / 3600, 2),
                /* Did the user turn up at all? NOT `seconds > 0`: the first
                   heartbeat of a day credits nothing, so a genuine short visit
                   stores a row worth 0 seconds. The streak counts that day, so
                   anything drawing a "days active" strip has to count it too —
                   otherwise a streak of 3 can sit beside 2 ticked days on the
                   same card, which reads as a bug even though both are right. */
                'active' => array_key_exists($date->toDateString(), $byDay),
            ];
        }

        $total = array_sum(array_column($buckets, 'seconds'));

        return response()->json([
            'days' => $buckets,
            // Rides along with the chart so the streak badge costs no extra
            // request — it is computed from its own query, not the buckets,
            // since a streak can run further back than the chart's window.
            'streak' => $this->streaks($request->user()),
            'total_seconds' => $total,
            'total_hours' => round($total / 3600, 2),
            // Averaged over the window, not over "days with activity" — the
            // dashed line on the chart is meant to read against all seven bars.
            'average_hours' => round($total / 3600 / $days, 2),
        ]);
    }

    /**
     * Dashboard side column: a merged feed of what the user recently did,
     * plus the flashcard tally.
     *
     * Everything here is derived from records the app already writes — saved
     * words, scans and tutor requests. Nothing new is tracked. Each source is
     * queried with its own LIMIT so this stays three small indexed reads no
     * matter how much history a user builds up.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $limit = 8;

        $flashcards = $user->flashcards()
            ->latest()
            ->take($limit)
            ->get(['id', 'word', 'translation', 'source_module', 'created_at'])
            ->map(fn ($f) => [
                'type' => 'flashcard',
                'title' => $f->word,
                'detail' => $f->translation,
                'source' => $f->source_module,
                'at' => $f->created_at,
            ]);

        $scans = $user->scans()
            ->latest()
            ->take($limit)
            ->get(['id', 'original_filename', 'created_at'])
            ->map(fn ($s) => [
                'type' => 'scan',
                'title' => $s->original_filename ?: 'Untitled scan',
                'detail' => null,
                'source' => 'scan',
                'at' => $s->created_at,
            ]);

        $bookings = $user->bookingsAsStudent()
            ->with('tutor:id,name')
            ->latest()
            ->take($limit)
            ->get(['id', 'tutor_id', 'status', 'created_at'])
            ->map(fn ($b) => [
                'type' => 'booking',
                'title' => $b->tutor->name ?? 'a tutor',
                'detail' => $b->status,
                'source' => 'tutor',
                'at' => $b->created_at,
            ]);

        $items = $flashcards
            ->concat($scans)
            ->concat($bookings)
            ->sortByDesc('at')
            ->take($limit)
            ->values();

        // Counted in SQL rather than by loading every row.
        $byModule = $user->flashcards()
            ->selectRaw('source_module, COUNT(*) as total')
            ->groupBy('source_module')
            ->pluck('total', 'source_module');

        return [
            'items' => $items,
            'stats' => [
                'total' => (int) $byModule->sum(),
                'by_module' => $byModule,
            ],
        ];
    }
}
