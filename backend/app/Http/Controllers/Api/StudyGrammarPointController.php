<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyGrammarPoint;
use App\Models\StudyUnit;
use Illuminate\Http\Request;

class StudyGrammarPointController extends Controller
{
    public function store(Request $request, StudyUnit $studyUnit)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'structure' => ['nullable', 'string'],
            'examples' => ['nullable', 'string'],
        ]);

        $point = $studyUnit->grammarPoints()->create($data);

        return response()->json($point, 201);
    }

    public function destroy(Request $request, StudyGrammarPoint $studyGrammarPoint)
    {
        abort_unless($request->user()->is_admin, 403);

        $studyGrammarPoint->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
