<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TutorLesson;
use App\Models\TutorProfile;
use Illuminate\Http\Request;

class TutorLessonController extends Controller
{
    public function store(Request $request, TutorProfile $tutorProfile)
    {
        TutorController::authorizeProfile($request, $tutorProfile);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:255'],
            'price' => ['required', 'integer', 'min:0'],
            // Steps a tutor actually teaches in. Free text would let someone
            // author a 7-minute lesson that never lines up with a slot.
            'duration_minutes' => ['required', 'integer', 'in:30,45,60,90,120'],
            'is_trial' => ['nullable', 'boolean'],
        ]);

        $data['is_trial'] = (bool) ($data['is_trial'] ?? false);

        // At most one trial per tutor. Marking a new one moves the flag rather
        // than refusing, which is what a tutor changing their trial offer
        // actually means — and it keeps hasUsedTrial() unambiguous.
        if ($data['is_trial']) {
            $tutorProfile->lessons()->where('is_trial', true)->update(['is_trial' => false]);
        }

        return response()->json($tutorProfile->lessons()->create($data), 201);
    }

    public function destroy(Request $request, TutorLesson $lesson)
    {
        TutorController::authorizeProfile($request, $lesson->tutorProfile);

        $lesson->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
