<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CourseEnrollment;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * "What am I learning, and when do I need to show up?"
 *
 * Deliberately NOT a courses endpoint and not a tutors endpoint. A student's
 * relationship with a tutor runs through two completely different shapes — a
 * private lesson they scheduled, and a group course they joined — and the
 * dashboard question spans both. Asking it as "my courses" would drop every
 * private lesson; asking it as "my tutors" would list a person when what the
 * student needs is a time.
 *
 * So this merges the two into one recency-ordered list of the next things to
 * turn up to. It is READ-ONLY and owns no table: bookings and
 * course_enrollments remain the source of truth.
 *
 * Student-side only for now. A tutor's dashboard answers a different question
 * ("what do I have to teach today?") and would need its own shaping.
 */
class LearningController extends Controller
{
    public function index(Request $request)
    {
        $limit = min(max((int) $request->query('limit', 3), 1), 10);
        $user = $request->user();

        $items = $this->privateLessons($user->id)
            ->merge($this->groupCourses($user->id))
            // One order across both kinds — the whole point of merging them.
            ->sortBy(fn ($i) => $i['starts_at'])
            ->values()
            ->take($limit);

        return $items->values();
    }

    /**
     * Scheduled private lessons that have not happened yet.
     *
     * `pending` counts as well as `confirmed`: the student has paid and is
     * expecting it, and hiding it until the tutor accepts would leave them
     * with no reminder of a lesson they are booked into.
     */
    private function privateLessons(int $userId)
    {
        /* The tutor's photo comes along for the card's thumbnail. Both columns
           are required: `user_id` is the key the relation matches on, and
           `photo_path` is what the appended `photo_url` accessor reads. */
        return Booking::with(['lesson', 'tutor:id,name', 'tutor.tutorProfile:id,user_id,photo_path'])
            ->where('student_id', $userId)
            ->whereIn('status', ['pending', 'confirmed'])
            ->whereNotNull('starts_at')
            /* Widened to include lessons already under way. Filtering on
               `starts_at >= now()` made the card VANISH the moment the lesson
               began — exactly when the student most needs it on screen.
               SQLite cannot add `duration_minutes` to a datetime in the WHERE
               clause, so the window is opened by the longest lesson the
               validator allows (480 min) and the real end time is applied in
               PHP below. */
            ->where('starts_at', '>=', now()->subMinutes(480))
            ->orderBy('starts_at')
            ->limit(20)
            ->get()
            ->filter(function (Booking $b) {
                $ends = Carbon::parse($b->starts_at)
                    ->addMinutes($b->duration_minutes ?: 30);

                return $ends->gte(now());
            })
            ->map(fn (Booking $b) => [
                'key' => 'lesson-'.$b->id,
                'kind' => 'private',
                'title' => optional($b->lesson)->name ?? 'Lesson',
                'tutor' => optional($b->tutor)->name,
                'starts_at' => Carbon::parse($b->starts_at)->toIso8601String(),
                // Sent so the card can say "Happening now" rather than making
                // the client guess the end from a duration.
                'ends_at' => Carbon::parse($b->starts_at)
                    ->addMinutes($b->duration_minutes ?: 30)
                    ->toIso8601String(),
                'duration_minutes' => $b->duration_minutes,
                'image_url' => optional(optional($b->tutor)->tutorProfile)->photo_url,
                // No lesson-detail page exists, so this points at the place the
                // booking actually lives, with its status and its actions.
                'href' => '/bookings',
                'status' => $b->status,
            ]);
    }

    /**
     * Group courses the student is in, dated to their NEXT class rather than to
     * the course's start.
     *
     * A course that began three weeks ago is still live, and dating it by
     * `starts_on` would sort it below everything and answer the wrong question.
     */
    private function groupCourses(int $userId)
    {
        return CourseEnrollment::with('course.tutorProfile.user:id,name')
            ->where('user_id', $userId)
            ->whereIn('status', ['held', 'confirmed'])
            ->whereNull('hidden_at')
            ->get()
            ->map(function (CourseEnrollment $e) {
                $course = $e->course;
                if (! $course) {
                    return null;
                }

                $next = $this->nextSession($course);
                if (! $next) {
                    return null;
                }

                return [
                    'key' => 'course-'.$e->id,
                    'kind' => 'group',
                    'title' => $course->title,
                    'tutor' => optional(optional($course->tutorProfile)->user)->name,
                    'starts_at' => $next->toIso8601String(),
                    'ends_at' => $next->copy()
                        ->addMinutes((int) ($course->minutes_per_class ?: 60))
                        ->toIso8601String(),
                    'duration_minutes' => $course->minutes_per_class,
                    'image_url' => optional($course->tutorProfile)->photo_url,
                    'href' => '/courses/'.$course->id,
                    'status' => $e->status,
                ];
            })
            // A course whose run has finished yields no next session and drops
            // out here rather than lingering on the dashboard forever.
            ->filter()
            ->values();
    }

    /**
     * The next class of a recurring course, or null once the run is over.
     *
     * Walks forward day by day from today rather than doing weekday arithmetic:
     * the run is bounded by `ends_on`, so the loop is short, and a plain scan
     * is far easier to be confident about than modular date maths against a
     * json array of weekdays.
     */
    private function nextSession($course): ?Carbon
    {
        $days = collect($course->days_of_week ?? [])->map(fn ($d) => (int) $d);
        if ($days->isEmpty() || ! $course->start_time) {
            return null;
        }

        /* `start_time` is WALL CLOCK in the tutor's own zone, not UTC — the
           same rule tutor_availability follows. Building it in UTC and letting
           the browser convert turned a 7:00 PM class into "2:00 AM" for a
           student seven hours ahead. It is constructed in the tutor's zone and
           serialised with that offset, so every reader converts it correctly
           to their own local time. */
        $tz = optional($course->tutorProfile)->timezone ?: config('app.timezone');

        /* Rebuilt from a plain Y-m-d string. `starts_on` is CAST to a Carbon,
           and handing an existing Carbon to `Carbon::parse($value, $tz)` keeps
           the instance's own zone — the timezone argument is silently ignored,
           which is why this kept emitting +00:00. */
        $end = Carbon::createFromFormat(
            'Y-m-d H:i',
            Carbon::parse($course->ends_on)->format('Y-m-d').' 23:59',
            $tz
        );
        $cursor = Carbon::createFromFormat(
            'Y-m-d H:i',
            Carbon::parse($course->starts_on)->format('Y-m-d').' 00:00',
            $tz
        );

        // Never look back further than today — a past class is not "next".
        $today = Carbon::now($tz)->startOfDay();
        if ($cursor->lt($today)) {
            $cursor = $today;
        }

        [$h, $m] = array_pad(explode(':', (string) $course->start_time), 2, '0');
        $minutes = (int) ($course->minutes_per_class ?: 60);

        while ($cursor->lte($end)) {
            if ($days->contains($cursor->dayOfWeek)) {
                $at = $cursor->copy()->setTime((int) $h, (int) $m);
                /* Compared on the END of the class, not its start. Against the
                   start, a course being taught RIGHT NOW would skip to the
                   following week's session — telling a student their Tuesday
                   class is on Thursday while they are sitting in it. */
                if ($at->copy()->addMinutes($minutes)->gte(Carbon::now($tz))) {
                    return $at;
                }
            }
            $cursor->addDay();
        }

        return null;
    }
}
