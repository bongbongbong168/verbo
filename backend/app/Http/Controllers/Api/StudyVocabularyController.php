<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyUnit;
use App\Models\StudyVocabulary;
use App\Services\DictionaryService;
use Illuminate\Http\Request;

class StudyVocabularyController extends Controller
{
    public function store(Request $request, StudyUnit $studyUnit, DictionaryService $dictionary)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'hanzi' => ['required', 'string', 'max:255'],
            'pinyin' => ['nullable', 'string', 'max:255'],
            'translation' => ['nullable', 'string', 'max:255'],
            'explanation' => ['nullable', 'string'],
        ]);

        // Fill the gaps from the offline CEDICT index so a word is useful the
        // moment it is added; anything typed in explicitly wins. The ?? matters:
        // validate() omits keys the request never sent.
        $data['pinyin'] = ($data['pinyin'] ?? null) ?: $dictionary->pinyinFor($data['hanzi']);
        $data['explanation'] = ($data['explanation'] ?? null) ?: $dictionary->lookup($data['hanzi']);

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
