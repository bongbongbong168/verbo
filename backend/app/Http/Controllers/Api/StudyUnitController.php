<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyLevel;
use App\Models\StudyUnit;
use App\Services\DictionaryService;
use Illuminate\Http\Request;

class StudyUnitController extends Controller
{
    public function show(StudyUnit $studyUnit, DictionaryService $dictionary)
    {
        return array_merge(
            $studyUnit->load('vocabulary', 'grammarPoints', 'quizQuestions', 'level:id,title')->toArray(),
            ['reading_tokens' => $studyUnit->reading ? $dictionary->annotate($studyUnit->reading) : []]
        );
    }

    public function store(Request $request, StudyLevel $studyLevel)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'reading' => ['nullable', 'string'],
            'culture_title' => ['nullable', 'string', 'max:255'],
            'culture_body' => ['nullable', 'string'],
        ]);

        $unit = $studyLevel->units()->create($data);

        return response()->json($unit, 201);
    }

    public function update(Request $request, StudyUnit $studyUnit)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'reading' => ['nullable', 'string'],
            'culture_title' => ['nullable', 'string', 'max:255'],
            'culture_body' => ['nullable', 'string'],
        ]);

        $studyUnit->update($data);

        return response()->json($studyUnit);
    }

    public function destroy(Request $request, StudyUnit $studyUnit)
    {
        abort_unless($request->user()->is_admin, 403);

        $studyUnit->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
