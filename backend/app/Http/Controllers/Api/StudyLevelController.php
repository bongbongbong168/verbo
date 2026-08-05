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
        // Oldest first so HSK 1 leads the carousel rather than trailing it.
        return StudyLevel::query()
            ->orderBy('id')
            ->get(['id', 'title', 'description', 'image_path', 'category']);
    }

    public function show(StudyLevel $studyLevel)
    {
        return $studyLevel->load('units:id,study_level_id,title,description');
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'category' => ['nullable', 'string', 'in:hsk,daily'],
            'image' => ['nullable', 'image', 'max:10240'],
        ]);

        $data['category'] = $data['category'] ?? 'hsk';

        if ($request->hasFile('image')) {
            $data['image_path'] = $request->file('image')->store('study-levels', 'public');
        }
        unset($data['image']);

        $level = $request->user()->studyLevels()->create($data);

        return response()->json($level, 201);
    }

    public function update(Request $request, StudyLevel $studyLevel)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'category' => ['nullable', 'string', 'in:hsk,daily'],
            'image' => ['nullable', 'image', 'max:10240'],
        ]);

        if ($request->hasFile('image')) {
            if ($studyLevel->image_path) {
                Storage::disk('public')->delete($studyLevel->image_path);
            }
            $data['image_path'] = $request->file('image')->store('study-levels', 'public');
        }
        unset($data['image']);

        $studyLevel->update($data);

        return response()->json($studyLevel);
    }

    public function destroy(Request $request, StudyLevel $studyLevel)
    {
        abort_unless($request->user()->is_admin, 403);

        if ($studyLevel->image_path) {
            Storage::disk('public')->delete($studyLevel->image_path);
        }

        $studyLevel->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
