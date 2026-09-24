<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Keeps the account avatar and the tutor-card photo as one identity picture.
 *
 * A tutor used to have one photo in Settings/messages and another in the
 * marketplace. They are both a picture of the same person, so every entry
 * point now comes through this service and updates both records together.
 */
class ProfilePhotoService
{
    public function replace(User $user, UploadedFile $photo): User
    {
        $user->loadMissing('tutorProfile');
        $oldPaths = collect([$user->avatar_path, $user->tutorProfile?->photo_path])
            ->filter()
            ->unique();

        $path = $photo->store('avatars', 'public');

        $user->avatar_path = $path;
        $user->save();

        if ($user->tutorProfile) {
            $user->tutorProfile->photo_path = $path;
            $user->tutorProfile->save();
        }

        $oldPaths->reject(fn ($old) => $old === $path)
            ->each(fn ($old) => Storage::disk('public')->delete($old));

        return $user->fresh();
    }

    public function clear(User $user): User
    {
        $user->loadMissing('tutorProfile');
        $oldPaths = collect([$user->avatar_path, $user->tutorProfile?->photo_path])
            ->filter()
            ->unique();

        $user->avatar_path = null;
        $user->save();

        if ($user->tutorProfile) {
            $user->tutorProfile->photo_path = null;
            $user->tutorProfile->save();
        }

        $oldPaths->each(fn ($old) => Storage::disk('public')->delete($old));

        return $user->fresh();
    }
}
