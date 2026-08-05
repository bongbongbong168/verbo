<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TutorProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TutorController extends Controller
{
    public function index()
    {
        return TutorProfile::with('user:id,name,email')->latest()->get();
    }

    public function show(Request $request)
    {
        return $request->user()->tutorProfile;
    }

    public function showProfile(TutorProfile $tutorProfile)
    {
        return $tutorProfile->load('user:id,name,email', 'lessons');
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'bio' => ['nullable', 'string'],
            'subjects' => ['nullable', 'string', 'max:255'],
            'hourly_rate' => ['nullable', 'integer', 'min:0'],
            'languages_spoken' => ['nullable', 'string', 'max:255'],
            'availability' => ['nullable', 'string', 'max:255'],
            'photo' => ['nullable', 'image', 'max:10240'],
        ]);

        $existing = $request->user()->tutorProfile;

        if ($request->hasFile('photo')) {
            if ($existing?->photo_path) {
                Storage::disk('public')->delete($existing->photo_path);
            }
            $data['photo_path'] = $request->file('photo')->store('tutors', 'public');
        }
        unset($data['photo']);

        $profile = $request->user()->tutorProfile()->updateOrCreate([], $data);

        return response()->json($profile->load('user:id,name,email'), 200);
    }
}
