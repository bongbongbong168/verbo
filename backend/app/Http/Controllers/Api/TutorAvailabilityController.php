<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TutorProfile;
use App\Services\SlotService;
use Illuminate\Http\Request;

class TutorAvailabilityController extends Controller
{
    /** The tutor's weekly hours, for the editing UI. */
    public function index(TutorProfile $tutorProfile)
    {
        return $tutorProfile->availabilitySlots()->get();
    }

    /**
     * Replace the whole weekly schedule in one call.
     *
     * A wholesale replace rather than per-row add/delete: the editor is a
     * week grid, so the client always knows the complete picture, and this
     * cannot leave a half-applied schedule if one row fails.
     */
    public function store(Request $request, TutorProfile $tutorProfile)
    {
        TutorController::authorizeProfile($request, $tutorProfile);

        $data = $request->validate([
            'timezone' => ['nullable', 'timezone'],
            'slots' => ['present', 'array'],
            'slots.*.day_of_week' => ['required', 'integer', 'min:0', 'max:6'],
            'slots.*.start_time' => ['required', 'date_format:H:i'],
            /*
             * NOT `date_format:H:i`, and that is the whole point of this rule.
             *
             * `H` is 00-23, so it rejects `24:00` — and `24:00` is exactly what
             * the editor sends when a tutor ticks the last half-hour of a day:
             * the chip starts at 23:30 and the range it closes ends at
             * midnight. The save is a WHOLESALE REPLACE, so that one rejected
             * row threw away the entire week's submission, and the tutor got
             * "slots.1.end_time does not match the format H:i" — an array index
             * naming no day, for a chip they had every right to tick. Their
             * hours then looked unchanged after a reload, because they were.
             *
             * `24:00` is a real end-of-day boundary, not a workaround:
             * PostgreSQL's `time` type accepts it as its documented maximum,
             * and `Carbon::setTime(24, 0)` rolls to the next midnight, which is
             * what SlotService already needs it to mean.
             *
             * `after:` still guards the ordering — strtotime resolves `24:00`
             * to the following midnight, so it compares correctly against any
             * start on the same day.
             */
            'slots.*.end_time' => ['required', 'regex:/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/', 'after:slots.*.start_time'],
        ], [
            // The default names the array index, which tells a tutor staring at
            // a week grid nothing they can act on.
            'slots.*.end_time.regex' => 'Each availability window must end on a time of day, up to 24:00.',
            'slots.*.end_time.after' => 'An availability window has to end after it starts.',
        ]);

        if (array_key_exists('timezone', $data)) {
            $tutorProfile->update(['timezone' => $data['timezone']]);
        }

        $tutorProfile->availabilitySlots()->delete();

        foreach ($data['slots'] as $slot) {
            $tutorProfile->availabilitySlots()->create($slot);
        }

        return response()->json($tutorProfile->availabilitySlots()->get(), 201);
    }

    /**
     * Bookable datetimes generated from those hours, minus what is taken.
     *
     * Length depends on the lesson: ask for a 60-minute lesson and you get the
     * starts where a full hour is free, not every 30-minute step.
     */
    public function slots(Request $request, TutorProfile $tutorProfile, SlotService $slots)
    {
        $lesson = $request->query('lesson')
            ? $tutorProfile->lessons()->find($request->query('lesson'))
            : null;

        $duration = $lesson->duration_minutes ?? SlotService::DEFAULT_MINUTES;

        return response()->json([
            'timezone' => $tutorProfile->timezone ?: config('app.timezone'),
            'duration_minutes' => $duration,
            // An empty slot list has two very different causes: the tutor has
            // set no weekly hours at all, or they have hours but nothing fits
            // this lesson. The client cannot tell those apart from the list
            // alone, and telling someone to "try a shorter lesson" when the
            // tutor has published no hours is simply wrong.
            'has_availability' => $tutorProfile->availabilitySlots()->exists(),
            // The viewer's own id, so each slot can also say whether THEY are
            // free then. Marked rather than filtered out: a time removed with
            // no explanation reads as the tutor having no hours, when in fact
            // the student has a lesson of their own booked over it.
            'slots' => $slots->forTutor(
                $tutorProfile,
                (int) $request->query('days', 14),
                $duration,
                optional($request->user())->id
            ),
        ]);
    }
}
