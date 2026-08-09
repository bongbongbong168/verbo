<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyText;
use App\Models\StudyTextLine;
use App\Models\StudyUnit;
use App\Services\DictionaryService;
use Illuminate\Http\Request;

class StudyTextController extends Controller
{
    public function store(Request $request, StudyUnit $studyUnit)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
        ]);

        // Append to the end of the unit's existing texts.
        $data['position'] = (int) $studyUnit->texts()->max('position') + 1;

        $text = $studyUnit->texts()->create($data);

        return response()->json($text->load('lines'), 201);
    }

    public function destroy(Request $request, StudyText $studyText)
    {
        abort_unless($request->user()->is_admin, 403);

        $studyText->delete();

        return response()->json(['message' => 'Deleted']);
    }

    public function storeLine(Request $request, StudyText $studyText, DictionaryService $dictionary)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'speaker' => ['nullable', 'string', 'max:255'],
            'chinese' => ['required', 'string'],
            'pinyin' => ['nullable', 'string'],
        ]);

        // Pinyin is generated from the sentence unless it was typed in.
        // Note the ?? — validate() omits keys the request never sent, so
        // reading $data['pinyin'] directly throws when the field is absent.
        $data['pinyin'] = ($data['pinyin'] ?? null) ?: $dictionary->pinyinFor($data['chinese']);
        $data['position'] = (int) $studyText->lines()->max('position') + 1;

        $line = $studyText->lines()->create($data);

        return response()->json($line, 201);
    }

    public function destroyLine(Request $request, StudyTextLine $studyTextLine)
    {
        abort_unless($request->user()->is_admin, 403);

        $studyTextLine->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
