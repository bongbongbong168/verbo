<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyLevel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class StudyLevelController extends Controller
{
    public function index()
    {
        // Natural sort by title so the carousel runs HSK 1..5 in order,
        // regardless of the order the levels were created in. SORT_NATURAL
        // also keeps "HSK 10" after "HSK 9" rather than after "HSK 1".
        // units_count lets the Dashboard pick the level with the most content
        // to feature, instead of whichever happens to sort first.
        return StudyLevel::query()
            ->select(['id', 'title', 'description', 'level_label', 'image_path', 'banner_path', 'accent_color', 'category'])
            ->withCount('units')
            ->get()
            ->sortBy('title', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();
    }

    /**
     * Units carry vocabulary/grammar counts so the module cards can show
     * "27 words · 3 Grammar" without the frontend fetching each unit.
     */
    public function show(StudyLevel $studyLevel)
    {
        return $studyLevel->load([
            'units' => fn ($q) => $q
                ->select('id', 'study_level_id', 'lesson_label', 'title', 'description')
                ->withCount(['vocabulary', 'grammarPoints'])
                ->orderBy('id'),
        ]);
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'level_label' => ['nullable', 'string', 'max:255'],
            'accent_color' => ['nullable', 'string', 'max:32'],
            'category' => ['nullable', 'string', 'in:hsk,daily'],
            'image' => ['nullable', 'image', 'max:10240'],
            'banner' => ['nullable', 'image', 'max:10240'],
        ]);

        $data['category'] = $data['category'] ?? 'hsk';

        if ($request->hasFile('image')) {
            $data['image_path'] = $request->file('image')->store('study-levels', 'public');
        }
        if ($request->hasFile('banner')) {
            $data['banner_path'] = $request->file('banner')->store('study-levels', 'public');
        }
        unset($data['image'], $data['banner']);

        $level = $request->user()->studyLevels()->create($data);

        return response()->json($level, 201);
    }

    public function update(Request $request, StudyLevel $studyLevel)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'level_label' => ['nullable', 'string', 'max:255'],
            'accent_color' => ['nullable', 'string', 'max:32'],
            'category' => ['nullable', 'string', 'in:hsk,daily'],
            'image' => ['nullable', 'image', 'max:10240'],
            'banner' => ['nullable', 'image', 'max:10240'],
        ]);

        if ($request->hasFile('image')) {
            if ($studyLevel->image_path) {
                Storage::disk('public')->delete($studyLevel->image_path);
            }
            $data['image_path'] = $request->file('image')->store('study-levels', 'public');
        }
        if ($request->hasFile('banner')) {
            if ($studyLevel->banner_path) {
                Storage::disk('public')->delete($studyLevel->banner_path);
            }
            $data['banner_path'] = $request->file('banner')->store('study-levels', 'public');
        }
        unset($data['image'], $data['banner']);

        $studyLevel->update($data);

        return response()->json($studyLevel);
    }

    public function destroy(Request $request, StudyLevel $studyLevel)
    {
        abort_unless($request->user()->is_admin, 403);

        foreach ([$studyLevel->image_path, $studyLevel->banner_path] as $path) {
            if ($path) {
                Storage::disk('public')->delete($path);
            }
        }

        $studyLevel->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
