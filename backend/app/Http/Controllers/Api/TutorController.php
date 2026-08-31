<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\TutorProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TutorController extends Controller
{
    public function index()
    {
        // The aggregates ride along in the same query. Cards on the Dashboard
        // and Find Tutor both show a rating, and fetching it per card would be
        // an N+1 on every page load.
        return TutorProfile::with('user:id,name,email')
            ->withCount('reviews')
            ->withAvg('reviews', 'rating')
            ->withMin(['lessons as cheapest_lesson' => fn ($q) => $q->bookablePriced()], 'price')
            ->latest()
            ->get()
            ->map(function ($profile) {
                // withAvg returns a raw float (or null); round it here so the
                // same tutor cannot read 4.67 on a card and 4.7 on their
                // profile. Null means unrated, which the UI shows as "New" —
                // 0 would read as a terrible score rather than no score.
                $profile->reviews_avg_rating = $profile->reviews_avg_rating !== null
                    ? round($profile->reviews_avg_rating, 1)
                    : null;

                return $profile;
            });
    }

    public function show(Request $request)
    {
        return $request->user()->tutorProfile;
    }

    public function showProfile(Request $request, TutorProfile $tutorProfile)
    {
        $tutorProfile->load([
            'user:id,name,email',
            'lessons',
            'resumeEntries',
            /* Both columns on each side are required: `avatar_path` because
               the appended `avatar_url` accessor reads it, and `user_id` on the
               tutor profile because the relation matches on it. Dropping either
               makes the photo silently null. */
            'reviews.user:id,name,avatar_path',
            'reviews.user.tutorProfile:id,user_id,photo_path',
        ]);

        // The stats bar's rating is the real average now, rounded to 1dp.
        // Sent as null rather than 0 when nobody has reviewed, so the page can
        // say "no rating yet" instead of showing a damning zero.
        $count = $tutorProfile->reviews->count();

        // Whether this viewer has already used their one trial with this
        // tutor, so the picker can grey it out instead of letting them choose
        // it and collecting a 422.
        $trialUsed = Booking::query()
            ->where('student_id', $request->user()->id)
            ->where('tutor_id', $tutorProfile->user_id)
            ->whereIn('status', ['pending', 'held', 'confirmed'])
            ->whereHas('lesson', fn ($q) => $q->where('is_trial', true))
            ->where(function ($q) {
                $q->where('status', '!=', 'held')
                    ->orWhereNull('hold_expires_at')
                    ->orWhere('hold_expires_at', '>', now());
            })
            ->exists();

        /* What this tutor actually costs, from the catalogue rather than the
           free-text `hourly_rate` they typed. Those two had drifted badly: one
           tutor advertised $15 while their real lessons were $1, $2 and $12, so
           the headline price matched nothing you could book.

           Computed from the already-loaded relation, so it costs no extra
           query. `index()` gets the same number via withMin + the same scope,
           so the list card and this card cannot disagree. */
        $cheapest = $tutorProfile->lessons
            ->filter(fn ($l) => ! $l->is_trial && $l->price !== null && $l->price > 0)
            ->min('price');

        return array_merge($tutorProfile->toArray(), [
            'review_count' => $count,
            'review_average' => $count ? round($tutorProfile->reviews->avg('rating'), 1) : null,
            'trial_used' => $trialUsed,
            'cheapest_lesson' => $cheapest,
        ]);
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
