<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TutorProfile;
use App\Models\TutorResumeEntry;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TutorResumeEntryController extends Controller
{
    public function store(Request $request, TutorProfile $tutorProfile)
    {
        TutorController::authorizeProfile($request, $tutorProfile);

        $data = $request->validate([
            'section' => ['required', Rule::in(TutorResumeEntry::SECTIONS)],
            'years' => ['nullable', 'string', 'max:60'],
            'title' => ['required', 'string', 'max:255'],
            'detail' => ['nullable', 'string', 'max:255'],
        ]);

        // Append to the end of its own section. SQLite doesn't reflect the
        // column default onto the returned model, so set it explicitly.
        $data['position'] = (int) $tutorProfile->resumeEntries()
            ->where('section', $data['section'])
            ->max('position') + 1;

        return response()->json($tutorProfile->resumeEntries()->create($data), 201);
    }

    public function destroy(Request $request, TutorResumeEntry $tutorResumeEntry)
    {
        TutorController::authorizeProfile($request, $tutorResumeEntry->tutorProfile);

        $tutorResumeEntry->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
