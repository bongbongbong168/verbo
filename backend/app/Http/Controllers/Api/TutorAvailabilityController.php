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
            // after: compares the two fields, so a window that ends before it
            // starts is rejected here rather than silently generating nothing.
            'slots.*.end_time' => ['required', 'date_format:H:i', 'after:slots.*.start_time'],
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
