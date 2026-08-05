<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyUnit;
use App\Models\StudyVocabulary;
use Illuminate\Http\Request;

class StudyVocabularyController extends Controller
{
    public function store(Request $request, StudyUnit $studyUnit)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'hanzi' => ['required', 'string', 'max:255'],
            'pinyin' => ['nullable', 'string', 'max:255'],
            'translation' => ['nullable', 'string', 'max:255'],
        ]);

        $word = $studyUnit->vocabulary()->create($data);

        return response()->json($word, 201);
    }

    public function destroy(Request $request, StudyVocabulary $studyVocabulary)
    {
        abort_unless($request->user()->is_admin, 403);

        $studyVocabulary->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
