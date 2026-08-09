<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyCultureImage;
use App\Models\StudyLevel;
use App\Models\StudyUnit;
use App\Services\DictionaryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class StudyUnitController extends Controller
{
    public function show(StudyUnit $studyUnit, DictionaryService $dictionary)
    {
        return array_merge(
            // The unit page reuses the level's banner styling, so it needs the
            // label, blurb and accent colour alongside the title.
            $studyUnit->load(
                'vocabulary',
                'texts.lines',
                'grammarPoints.examples',
                'quizQuestions',
                'cultureImages',
                'level:id,title,description,level_label,accent_color'
            )->toArray(),
            ['reading_tokens' => $studyUnit->reading ? $dictionary->annotate($studyUnit->reading) : []]
        );
    }

    public function store(Request $request, StudyLevel $studyLevel)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'lesson_label' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'reading' => ['nullable', 'string'],
            'culture_title' => ['nullable', 'string', 'max:255'],
            'culture_body' => ['nullable', 'string'],
        ]);

        $unit = $studyLevel->units()->create($data);

        return response()->json($unit, 201);
    }

    public function update(Request $request, StudyUnit $studyUnit, DictionaryService $dictionary)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'lesson_label' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'reading' => ['nullable', 'string'],
            'culture_title' => ['nullable', 'string', 'max:255'],
            'culture_body' => ['nullable', 'string'],
            'culture_term' => ['nullable', 'string', 'max:255'],
            'culture_term_pinyin' => ['nullable', 'string', 'max:255'],
        ]);

        // Generate the term's reading unless one was typed in. The ?? matters —
        // validate() omits keys the request never sent, and the culture form is
        // only one of several that PATCH this endpoint.
        if (! empty($data['culture_term'])) {
            $data['culture_term_pinyin'] = ($data['culture_term_pinyin'] ?? null)
                ?: $dictionary->pinyinForTerm($data['culture_term']);
        }

        $studyUnit->update($data);

        return response()->json($studyUnit);
    }

    public function storeCultureImage(Request $request, StudyUnit $studyUnit)
    {
        abort_unless($request->user()->is_admin, 403);

        $request->validate([
            'image' => ['required', 'image', 'max:5120'],
        ]);

        $path = $request->file('image')->store('culture', 'public');

        $image = $studyUnit->cultureImages()->create([
            'path' => $path,
            'position' => (int) $studyUnit->cultureImages()->max('position') + 1,
        ]);

        return response()->json($image, 201);
    }

    public function destroyCultureImage(Request $request, StudyCultureImage $studyCultureImage)
    {
        abort_unless($request->user()->is_admin, 403);

        // Unlike scans, these files persist — clean the disk up too.
        Storage::disk('public')->delete($studyCultureImage->path);
        $studyCultureImage->delete();

        return response()->json(['message' => 'Deleted']);
    }

    public function destroy(Request $request, StudyUnit $studyUnit)
    {
        abort_unless($request->user()->is_admin, 403);

        $studyUnit->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
