<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TutorLesson;
use Illuminate\Http\Request;

class TutorLessonController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:255'],
            'price' => ['required', 'integer', 'min:0'],
        ]);

        $profile = $request->user()->tutorProfile;

        abort_unless($profile, 422, 'Create your tutor profile before adding lessons.');

        $lesson = $profile->lessons()->create($data);

        return response()->json($lesson, 201);
    }

    public function destroy(Request $request, TutorLesson $lesson)
    {
        if ((int) $lesson->tutorProfile->user_id !== $request->user()->id) {
            abort(403);
        }

        $lesson->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
