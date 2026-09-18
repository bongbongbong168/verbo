<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyUnit;
use App\Models\StudyUnitCompletion;
use Illuminate\Http\Request;

/**
 * Mark a lesson finished, or take it back.
 *
 * Called by the lesson page when the learner plays the whole conversation or
 * finishes the practice run, and by its own "Mark as done" button - the same
 * endpoint however it got there. Both directions are idempotent.
 */
class StudyUnitCompletionController extends Controller
{
    public function store(Request $request, StudyUnit $studyUnit)
    {
        $row = StudyUnitCompletion::firstOrCreate(
            ['user_id' => $request->user()->id, 'study_unit_id' => $studyUnit->id],
            ['completed_at' => now()]
        );

        return ['completed' => true, 'completed_at' => $row->completed_at];
    }

    public function destroy(Request $request, StudyUnit $studyUnit)
    {
        StudyUnitCompletion::where('user_id', $request->user()->id)
            ->where('study_unit_id', $studyUnit->id)
            ->delete();

        return ['completed' => false, 'completed_at' => null];
    }
}
