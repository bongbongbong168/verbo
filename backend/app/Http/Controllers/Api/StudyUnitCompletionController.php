<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyUnit;
use App\Models\StudyUnitCompletion;
use Illuminate\Http\Request;

/**
 * Mark a lesson finished.
 *
 * Called when the learner plays the whole conversation or finishes the main
 * quiz. Completion is idempotent and is not manually toggled from the UI.
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
}
