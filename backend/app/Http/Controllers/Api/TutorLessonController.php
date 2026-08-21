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
        ]);

        return response()->json($tutorProfile->lessons()->create($data), 201);
    }

    public function destroy(Request $request, TutorLesson $lesson)
    {
        TutorController::authorizeProfile($request, $lesson->tutorProfile);

        $lesson->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
