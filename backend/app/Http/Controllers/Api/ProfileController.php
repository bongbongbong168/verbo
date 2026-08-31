<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CourseEnrollment;
use App\Models\Podcast;
use App\Models\StudyUnit;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    /**
     * Change the display name.
     *
     * Email is deliberately not editable here: changing it would need a
     * verification round-trip to prove the new address belongs to the user,
     * and there is no mail sending in this app. The Settings page shows it
     * read-only and says so, rather than offering a change that would quietly
     * lock someone out of their own login.
     */
    public function update(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $request->user()->update($data);

        return response()->json($request->user()->fresh());
    }

    /**
     * Mark onboarding as done.
     *
     * Separate from saving the answers on purpose: "has this person been
     * asked?" is a different fact from "what did they answer?". Someone who
     * skipped every question has been asked, and deriving the flag from the
     * existence of a preferences row would put them back in the flow on every
     * load — punishing them for declining.
     *
     * Idempotent, and it never un-sets: re-running onboarding from Settings
     * later must not be able to strand an account back in the flow.
     */
    public function completeOnboarding(Request $request)
    {
        $user = $request->user();

        if (! $user->onboarded_at) {
            $user->forceFill(['onboarded_at' => now()])->save();
        }

        return response()->json($user->fresh());
    }

    /**
     * Change the password.
     *
     * The current password is required even though the caller already holds a
     * valid token — a token can be left behind on a shared machine, and this is
     * the one action that would let whoever found it take the account.
     *
     * Every other token is revoked on success, so anyone signed in with the old
     * password is kicked out. The caller's own token is spared, or changing
     * your password would sign you out of the tab you did it in.
     */
    public function updatePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['That is not your current password.'],
            ]);
        }

        $user->update(['password' => Hash::make($data['password'])]);

        $user->tokens()->where('id', '!=', $request->user()->currentAccessToken()->id)->delete();

        return response()->json(['message' => 'Password updated']);
    }

    /**
     * Sign out everywhere else — revokes every token but the one making the
     * request. The count is returned so the UI can say what actually happened
     * rather than claiming success on a no-op.
     */
    public function revokeOtherSessions(Request $request)
    {
        $revoked = $request->user()->tokens()
            ->where('id', '!=', $request->user()->currentAccessToken()->id)
            ->delete();

        return response()->json(['revoked' => $revoked]);
    }

    /**
     * Counts for the Settings page's "your data" summary. Cheap COUNT queries
     * rather than loading the rows.
     */
    /**
     * Everything the profile page and the header popover show, in one call.
     *
     * The popover renders on every page but only fetches when it is actually
     * opened, so this is never on the critical path of a page load.
     */
    public function overview(Request $request)
    {
        $user = $request->user();

        /* "Current level" is DERIVED from the last study unit they opened, not
           stored on the user — there is no level column and inventing one would
           mean a second thing to keep in step with what they actually study. */
        $level = null;
        $lastUnitView = $user->recentViews()
            ->where('viewable_type', StudyUnit::class)
            ->orderByDesc('last_viewed_at')
            ->first();

        if ($lastUnitView) {
            $unit = StudyUnit::with('level:id,title')->find($lastUnitView->viewable_id);

            // The unit or its level can be deleted after being opened.
            if ($unit && $unit->level) {
                /* Progress is "units of this level you have OPENED", which is
                   the only completion signal that exists — nothing records a
                   unit as finished. The page labels it as opened, not mastered,
                   so the number cannot claim more than it knows. */
                $unitIds = StudyUnit::where('study_level_id', $unit->level->id)->pluck('id');
                $opened = $unitIds->isEmpty() ? 0 : $user->recentViews()
                    ->where('viewable_type', StudyUnit::class)
                    ->whereIn('viewable_id', $unitIds)
                    ->count();

                $level = [
                    'id' => $unit->level->id,
                    'title' => $unit->level->title,
                    'units_total' => $unitIds->count(),
                    'units_opened' => $opened,
                    'percent' => $unitIds->isEmpty()
                        ? 0
                        : (int) round($opened / $unitIds->count() * 100),
                ];
            }
        }

        return response()->json([
            'name' => $user->name,
            'email' => $user->email,
            'is_admin' => (bool) $user->is_admin,
            'member_since' => $user->created_at,
            'level' => $level,
            'stats' => [
                'flashcards' => $user->flashcards()->count(),
                'scans' => $user->scans()->count(),
                'units_opened' => $user->recentViews()
                    ->where('viewable_type', StudyUnit::class)
                    ->count(),
                'podcasts_opened' => $user->recentViews()
                    ->where('viewable_type', Podcast::class)
                    ->count(),
            ],
            'tutors' => $this->tutorsFor($user),
            'courses' => $this->coursesFor($user),
            // Drives the "Tutor profile" link — absent for most accounts.
            'tutor_profile_id' => optional($user->tutorProfile)->id,
        ]);
    }

    /**
     * Tutors this student actually has a relationship with.
     *
     * Cancelled, declined and expired bookings are excluded on purpose: a trial
     * someone booked and called off does not make that person "my tutor".
     */
    private function tutorsFor($user): array
    {
        $tutorIds = Booking::where('student_id', $user->id)
            ->whereIn('status', ['held', 'pending', 'confirmed'])
            ->pluck('tutor_id')
            ->unique()
            ->values();

        if ($tutorIds->isEmpty()) {
            return [];
        }

        return User::whereIn('id', $tutorIds)
            ->with('tutorProfile:id,user_id,photo_path,subjects')
            ->get()
            ->map(fn (User $t) => [
                'id' => $t->id,
                'name' => $t->name,
                'profile_id' => optional($t->tutorProfile)->id,
                'photo_url' => optional($t->tutorProfile)->photo_url,
                'subjects' => optional($t->tutorProfile)->subjects,
            ])
            ->values()
            ->all();
    }

    /**
     * Live course enrolments, each with how far through the run it is.
     *
     * The week is COMPUTED from starts_on rather than stored — a stored week
     * number would need a nightly job to stay true and would be silently wrong
     * the moment that job missed a run.
     */
    private function coursesFor($user): array
    {
        return CourseEnrollment::where('user_id', $user->id)
            ->whereIn('status', ['held', 'confirmed'])
            ->with('course')
            ->get()
            ->filter(fn (CourseEnrollment $e) => $e->course !== null)
            ->map(function (CourseEnrollment $e) {
                $course = $e->course;
                $weeks = (int) $course->weeks;
                $week = null;

                if ($course->starts_on) {
                    $start = Carbon::parse($course->starts_on)->startOfDay();
                    // 0 means "not started yet", which the page words differently.
                    $week = $start->isFuture()
                        ? 0
                        : min($weeks, intdiv($start->diffInDays(now()), 7) + 1);
                }

                return [
                    'id' => $course->id,
                    'title' => $course->title,
                    'level' => $course->level,
                    'weeks' => $weeks,
                    'week' => $week,
                    'starts_on' => $course->starts_on,
                    'status' => $e->status,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Set or replace the account's profile picture.
     *
     * Validated by EXTENSION (`mimes:`) rather than sniffed mimetype — PHP's
     * fileinfo reports ordinary images with surprising types, the same trap
     * podcast audio and chat attachments hit.
     *
     * Stored on the PUBLIC disk: an avatar is shown to anyone who can see the
     * user in a thread or a tutor card, so there is nothing to gate.
     */
    public function updateAvatar(Request $request)
    {
        $request->validate([
            'avatar' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
        ]);

        $user = $request->user();
        $old = $user->avatar_path;

        // Not mass-assigned: avatar_path is deliberately out of $fillable so
        // only this endpoint — which owns cleaning up the replaced file — can
        // ever move it.
        $user->avatar_path = $request->file('avatar')->store('avatars', 'public');
        $user->save();

        // Delete only after the new one is safely saved, so a failed write
        // never leaves the account with no picture at all.
        if ($old) {
            Storage::disk('public')->delete($old);
        }

        return response()->json($user->fresh());
    }

    /** Remove it and fall back to the initial. */
    public function deleteAvatar(Request $request)
    {
        $user = $request->user();

        if ($user->avatar_path) {
            Storage::disk('public')->delete($user->avatar_path);
            $user->avatar_path = null;
            $user->save();
        }

        return response()->json($user->fresh());
    }

    public function stats(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'flashcards' => $user->flashcards()->count(),
            'scans' => $user->scans()->count(),
            'units_opened' => $user->recentViews()
                ->where('viewable_type', StudyUnit::class)
                ->count(),
            'other_sessions' => $user->tokens()
                ->where('id', '!=', $request->user()->currentAccessToken()->id)
                ->count(),
            'member_since' => $user->created_at,
        ]);
    }
}
