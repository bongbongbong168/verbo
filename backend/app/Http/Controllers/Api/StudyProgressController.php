<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyUnit;
use Illuminate\Http\Request;

class StudyProgressController extends Controller
{
    /**
     * Record that the user opened a unit. Called by the unit page on load, so
     * it is deliberately cheap and idempotent: one row per user per unit, with
     * the timestamp moved forward on every revisit.
     */
    public function store(Request $request, StudyUnit $studyUnit)
    {
        // Created through the relation so user_id is set directly rather than
        // by mass assignment — the same reason tutorProfile()/flashcards() do.
        $request->user()->studyProgress()->updateOrCreate(
            ['study_unit_id' => $studyUnit->id],
            ['last_viewed_at' => now()]
        );

        return response()->json(['message' => 'Recorded']);
    }

    /**
     * The single most recently opened unit, shaped for the Dashboard's
     * "Pick up where you left off" tile: the unit, its level, and its 1-based
     * position within that level so the tile can label it "Unit N".
     *
     * Returns 204 rather than 404 when the user has never opened a unit — that
     * is an ordinary empty state, not an error, and the Dashboard falls back to
     * featuring a level instead.
     */
    public function latest(Request $request)
    {
        $progress = $request->user()->studyProgress()
            ->with('studyUnit.level')
            ->orderByDesc('last_viewed_at')
            ->first();

        // The unit (or its level) can be deleted after being viewed; the
        // cascade removes the row, but guard anyway rather than 500 on null.
        if (! $progress || ! $progress->studyUnit || ! $progress->studyUnit->level) {
            return response()->noContent();
        }

        $unit = $progress->studyUnit;

        $position = StudyUnit::where('study_level_id', $unit->study_level_id)
            ->where('id', '<=', $unit->id)
            ->count();

        return response()->json([
            'unit' => [
                'id' => $unit->id,
                'title' => $unit->title,
                'description' => $unit->description,
                'lesson_label' => $unit->lesson_label,
                'position' => $position,
            ],
            'level' => [
                'id' => $unit->level->id,
                'title' => $unit->level->title,
                'image_url' => $unit->level->image_url,
            ],
            'last_viewed_at' => $progress->last_viewed_at,
        ]);
    }
}
