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
        // The unit page reuses the level's banner styling, so it needs the
        // label, blurb and accent colour alongside the title.
        $studyUnit->load(
            'vocabulary',
            'texts.lines',
            'grammarPoints.examples',
            'quizQuestions',
            'cultureImages',
            // `category` too: the unit page words its way out differently for a
            // Daily Use situation than for an HSK rung, and without the column
            // that check silently reads undefined and always picks HSK.
            'level:id,title,description,level_label,accent_color,category'
        );

        $payload = $studyUnit->toArray();

        /* Every conversation line gets the same token treatment Read, Podcast
           and Scan already give their text, so a word in a dialogue can be
           hovered for pinyin + meaning and saved with Alt+1.

           This closes a real gap rather than adding a feature: the reading
           rework replaced the annotated render with plain per-character spans,
           which left the unit page's Alt+1 listener reading a ref that nothing
           ever assigned to — the shortcut was dead here and only here. Words
           are the point of a conversation lesson, so the one page built around
           dialogue was the worst place to lose it.

           Annotated per line, not over the joined text: a line belongs to one
           speaker, and segmenting across a speaker change would invent words
           that span two people talking. */
        foreach ($payload['texts'] ?? [] as $ti => $text) {
            foreach ($text['lines'] ?? [] as $li => $line) {
                $payload['texts'][$ti]['lines'][$li]['tokens'] =
                    filled($line['chinese']) ? $dictionary->annotate($line['chinese']) : [];
            }
        }

        /* Where this lesson sits in its topic, and what follows it.
​
           Derived from the sibling list rather than stored: a `position` column
           would need rewriting every time a lesson was added, reordered or
           deleted, and would be silently wrong the first time that failed.

           Ordered by id, which is the order they were authored and the order
           the level page already lists them in — so "Lesson 2 of 4" agrees with
           what the learner just clicked.

           `next` is the next lesson IN THIS TOPIC only. Progression belongs
           inside a topic; nothing here should push someone from Ordering Food
           into an unrelated situation. */
        $siblings = $studyUnit->level
            ? $studyUnit->level->units()->orderBy('id')->pluck('title', 'id')
            : collect();

        $ids = $siblings->keys()->all();
        $index = array_search($studyUnit->id, $ids, true);
        $nextId = $index !== false ? ($ids[$index + 1] ?? null) : null;

        return array_merge($payload, [
            'reading_tokens' => $studyUnit->reading ? $dictionary->annotate($studyUnit->reading) : [],
            'lesson_position' => $index === false ? null : $index + 1,
            'lesson_total' => count($ids),
            'next_unit' => $nextId ? ['id' => $nextId, 'title' => $siblings[$nextId]] : null,
        ]);
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
