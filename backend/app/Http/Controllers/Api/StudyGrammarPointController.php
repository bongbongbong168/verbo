<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyGrammarExample;
use App\Models\StudyGrammarPoint;
use App\Models\StudyUnit;
use App\Services\DictionaryService;
use Illuminate\Http\Request;

class StudyGrammarPointController extends Controller
{
    public function store(Request $request, StudyUnit $studyUnit)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'structure' => ['nullable', 'string'],
        ]);

        $point = $studyUnit->grammarPoints()->create($data);

        return response()->json($point->load('examples'), 201);
    }

    public function update(Request $request, StudyGrammarPoint $studyGrammarPoint)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'structure' => ['nullable', 'string'],
        ]);

        $studyGrammarPoint->update($data);

        return response()->json($studyGrammarPoint->load('examples'));
    }

    public function destroy(Request $request, StudyGrammarPoint $studyGrammarPoint)
    {
        abort_unless($request->user()->is_admin, 403);

        $studyGrammarPoint->delete();

        return response()->json(['message' => 'Deleted']);
    }

    public function storeExample(Request $request, StudyGrammarPoint $studyGrammarPoint, DictionaryService $dictionary)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'chinese' => ['required', 'string'],
            'pinyin' => ['nullable', 'string'],
            'english' => ['nullable', 'string'],
        ]);

        // Same idiom as StudyTextController: generate pinyin unless it was typed
        // in. The ?? matters — validate() omits keys the request never sent.
        $data['pinyin'] = ($data['pinyin'] ?? null) ?: $dictionary->pinyinFor($data['chinese']);
        $data['position'] = (int) $studyGrammarPoint->examples()->max('position') + 1;

        $example = $studyGrammarPoint->examples()->create($data);

        return response()->json($example, 201);
    }

    public function destroyExample(Request $request, StudyGrammarExample $studyGrammarExample)
    {
        abort_unless($request->user()->is_admin, 403);

        $studyGrammarExample->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
