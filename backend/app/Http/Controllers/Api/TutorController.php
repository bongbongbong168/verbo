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
        return $tutorProfile->load('user:id,name,email', 'lessons', 'resumeEntries');
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
            'video_url' => ['nullable', 'url', 'max:500'],
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

    /**
     * Set the photo on any tutor profile. store() above is an upsert keyed on
     * the authenticated user, so a tutor can only ever change their own — which
     * leaves seeded profiles, whose accounts have no usable password, with no
     * way to get a photo at all. Admin-gated, same as the Read/Study writes.
     */
    public function updatePhoto(Request $request, TutorProfile $tutorProfile)
    {
        abort_unless($request->user()->is_admin, 403);

        $request->validate([
            'photo' => ['required', 'image', 'max:10240'],
        ]);

        if ($tutorProfile->photo_path) {
            Storage::disk('public')->delete($tutorProfile->photo_path);
        }

        $tutorProfile->update([
            'photo_path' => $request->file('photo')->store('tutors', 'public'),
        ]);

        return response()->json($tutorProfile->load('user:id,name,email'));
    }

    /**
     * Everything the edit drawer can change in one call, on any profile the
     * caller is allowed to touch.
     *
     * store() above is an upsert keyed on the authenticated user, so it can
     * only ever reach the caller's own profile — which leaves seeded tutors,
     * whose accounts have no usable password, uneditable. This one takes the
     * profile explicitly and lets an admin through, so the same drawer serves
     * both a tutor editing themselves and an admin editing a seeded tutor.
     *
     * Multipart, because it carries the photo. validate() omits keys the
     * request never sent, so a drawer tab that submits only some fields leaves
     * the rest untouched; an explicitly empty field still clears its column.
     */
    public function updateProfile(Request $request, TutorProfile $tutorProfile)
    {
        self::authorizeProfile($request, $tutorProfile);

        $data = $request->validate([
            'bio' => ['nullable', 'string'],
            'subjects' => ['nullable', 'string', 'max:255'],
            'hourly_rate' => ['nullable', 'integer', 'min:0'],
            'languages_spoken' => ['nullable', 'string', 'max:255'],
            'availability' => ['nullable', 'string', 'max:255'],
            'photo' => ['nullable', 'image', 'max:10240'],
            'video_url' => ['nullable', 'url', 'max:500'],
        ]);

        if ($request->hasFile('photo')) {
            if ($tutorProfile->photo_path) {
                Storage::disk('public')->delete($tutorProfile->photo_path);
            }
            $data['photo_path'] = $request->file('photo')->store('tutors', 'public');
        }
        unset($data['photo']);

        $tutorProfile->update($data);

        return response()->json(
            $tutorProfile->fresh()->load('user:id,name,email', 'lessons', 'resumeEntries')
        );
    }

    /**
     * A tutor profile and everything hanging off it (lessons, resume entries)
     * is editable by the tutor who owns it, or by an admin acting on their
     * behalf. Static so the lesson and resume controllers share one rule
     * rather than each restating it.
     */
    public static function authorizeProfile(Request $request, ?TutorProfile $profile): void
    {
        abort_unless($profile, 404);

        $user = $request->user();

        abort_unless((int) $profile->user_id === $user->id || $user->is_admin, 403);
    }
}
