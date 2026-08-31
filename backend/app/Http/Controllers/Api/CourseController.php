<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Notification;
use App\Models\CourseEnrollment;
use App\Models\TutorProfile;
use App\Services\PaymentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CourseController extends Controller
{
    /** All courses, for the Find Tutor list's Group Courses tab. */
    public function index()
    {
        // withCount, not the accessor, so the list is one query rather than one
        // per row — same reasoning as the tutor list's review aggregates.
        return Course::query()
            ->with('tutorProfile.user:id,name')
            ->withCount('liveEnrollments')
            ->orderBy('starts_on')
            ->get();
    }

    /** Courses belonging to one tutor, for their profile's Lessons card. */
    public function forTutor(TutorProfile $tutorProfile)
    {
        return $tutorProfile->courses()
            ->withCount('liveEnrollments')
            ->orderBy('starts_on')
            ->get();
    }

    public function show(Course $course)
    {
        return $course->load('tutorProfile.user:id,name')->loadCount('liveEnrollments');
    }

    public function store(Request $request, TutorProfile $tutorProfile)
    {
        TutorController::authorizeProfile($request, $tutorProfile);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'level' => ['nullable', 'string', 'max:60'],
            'outcomes' => ['nullable', 'string'],
            'price' => ['required', 'integer', 'min:0'],
            'weeks' => ['required', 'integer', 'min:1', 'max:104'],
            'total_classes' => ['required', 'integer', 'min:1', 'max:500'],
            'classes_per_week' => ['required', 'integer', 'min:1', 'max:7'],
            'minutes_per_class' => ['required', 'integer', 'min:10', 'max:480'],
            'capacity' => ['required', 'integer', 'min:1', 'max:200'],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            'days_of_week' => ['required', 'array', 'min:1'],
            'days_of_week.*' => ['integer', 'min:0', 'max:6'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i', 'after:start_time'],
        ]);

        return response()->json($tutorProfile->courses()->create($data), 201);
    }

    public function destroy(Request $request, Course $course)
    {
        TutorController::authorizeProfile($request, $course->tutorProfile);

        $course->delete();

        return response()->json(['message' => 'Deleted']);
    }

    /**
     * Enrol — held, not confirmed, exactly like a booking. Payment flips it,
     * so both flows meet the same seam.
     */
    public function enroll(Request $request, Course $course)
    {
        $user = $request->user();

        if ((int) $course->tutorProfile->user_id === $user->id) {
            return response()->json(['message' => 'You cannot enrol in your own course.'], 422);
        }

        if ($course->ends_on->isPast()) {
            return response()->json(['message' => 'That course has already finished.'], 422);
        }

        try {
            $enrollment = DB::transaction(function () use ($course, $user) {
                // Release lapsed holds first — the same trick bookings use to
                // free a slot without a cleanup job.
                CourseEnrollment::where('course_id', $course->id)
                    ->where('status', 'held')
                    ->whereNotNull('hold_expires_at')
                    ->where('hold_expires_at', '<=', now())
                    ->update(['status' => 'expired']);

                // Re-read capacity inside the transaction; two people can pass
                // a check outside it and both take the last seat.
                if ($course->liveEnrollments()->count() >= $course->capacity) {
                    abort(409, 'This course is full.');
                }

                /* Re-enrolling UN-HIDES the row. A student may have cleared a
                   cancelled or finished enrolment from their list, and this is
                   one row per (course, user) — so without clearing `hidden_at`
                   the new hold inherits the old row's hidden flag, vanishes
                   from `myEnrollments`, and checkout cannot find the order it
                   was just sent to ("That order could not be found"). Hiding
                   means "done with that one", not "never show this course to
                   me again". */
                return CourseEnrollment::updateOrCreate(
                    ['course_id' => $course->id, 'user_id' => $user->id],
                    [
                        'status' => 'held',
                        'hold_expires_at' => now()->addMinutes(CourseEnrollment::HOLD_MINUTES),
                        'hidden_at' => null,
                    ]
                );
            });
        } catch (\Illuminate\Database\QueryException $e) {
            return response()->json(['message' => 'You are already enrolled in this course.'], 409);
        }

        return response()->json($enrollment->load('course'), 201);
    }

    /**
     * The DEMO settle path, refused once Stripe is configured.
     *
     * With real keys in place a seat must be paid for before it is confirmed —
     * otherwise anyone could POST here and enrol for free. The live path is
     * PaymentController: create an intent, pay it, and let the webhook call
     * `settle()` below.
     */
    public function confirmEnrollment(Request $request, CourseEnrollment $enrollment)
    {
        abort_unless((int) $enrollment->user_id === $request->user()->id, 403);

        abort_if(
            PaymentService::configured(),
            422,
            'Payments are live — this enrolment must be paid through the checkout.'
        );

        if ($enrollment->status === 'confirmed') {
            return response()->json($enrollment->load('course'));
        }

        if ($enrollment->status !== 'held') {
            return response()->json(['message' => 'That enrolment is no longer open.'], 422);
        }

        self::settle($enrollment);

        return response()->json($enrollment->fresh()->load('course'));
    }

    /**
     * Turn a paid hold into a confirmed seat.
     *
     * Split out so the Stripe webhook can call it with no Request and no
     * authenticated user — the browser may never come back from the card sheet,
     * so fulfilment cannot depend on it. Idempotent: Stripe retries webhooks,
     * and a second delivery must not notify the tutor twice.
     *
     * A course confirms on payment where a private lesson does not, because a
     * course has no approval step: the tutor published the schedule and seats
     * are seats.
     */
    public static function settle(CourseEnrollment $enrollment): void
    {
        if ($enrollment->status !== 'held') {
            return;
        }

        $enrollment->update(['status' => 'confirmed', 'hold_expires_at' => null]);

        // The tutor published the schedule, so there is no approval step — but
        // they still want to know a seat went.
        $course = $enrollment->course;
        if ($course && $course->tutorProfile) {
            Notification::raise(
                $course->tutorProfile->user_id,
                (int) $enrollment->user_id,
                'course_enrolled',
                [
                    'title' => 'New course enrolment',
                    'body' => (optional($enrollment->user)->name ?? 'A student')
                        .' enrolled in '.$course->title.'.',
                    'link' => '/courses/'.$course->id,
                ]
            );
        }
    }

    public function cancelEnrollment(Request $request, CourseEnrollment $enrollment)
    {
        abort_unless((int) $enrollment->user_id === $request->user()->id, 403);

        $enrollment->update(['status' => 'cancelled', 'hold_expires_at' => null]);

        // Giving up a seat gives back the money — same rule as a lesson.
        $refunded = PaymentService::refund($enrollment);

        return response()->json(['message' => 'Cancelled', 'refunded' => $refunded]);
    }

    /** Clear a finished enrolment from the student's own list. */
    public function hideEnrollment(Request $request, CourseEnrollment $enrollment)
    {
        abort_unless((int) $enrollment->user_id === $request->user()->id, 403);

        if (in_array($enrollment->status, ['held', 'confirmed'], true)) {
            return response()->json(
                ['message' => 'Cancel this enrolment before clearing it from your list.'],
                422
            );
        }

        $enrollment->update(['hidden_at' => now()]);

        return response()->json(['message' => 'Removed']);
    }

    /** The signed-in student's own enrolments, for My Lessons. */
    public function myEnrollments(Request $request)
    {
        return CourseEnrollment::where('user_id', $request->user()->id)
            ->whereNull('hidden_at')
            ->with('course.tutorProfile.user:id,name')
            ->latest()
            ->get();
    }
}
