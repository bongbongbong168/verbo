<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CourseEnrollment;
use App\Models\HiddenTutor;
use App\Models\Podcast;
use App\Models\StudyLevel;
use App\Models\StudyUnit;
use App\Models\User;
use App\Services\ProfilePhotoService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
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

        /* The profile's current level is the last HSK unit opened. Daily Use
           is a situation, not a proficiency level. Filter before choosing the
           latest view so a newer situation cannot hide earlier HSK progress. */
        $level = null;
        $lastUnitView = $user->recentViews()
            ->where('viewable_type', StudyUnit::class)
            ->whereIn('viewable_id', StudyUnit::query()
                ->select('id')
                ->whereHas('level', fn ($q) => $q->where('category', 'hsk')))
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

        /* The HSK books this learner has actually opened a unit in, for the
           shelf on the progress card. Derived from recent_views like the level
           above; Daily Use situations are not books, so they are left out. */
        $openedUnitIds = $user->recentViews()
            ->where('viewable_type', StudyUnit::class)
            ->pluck('viewable_id');
        $books = $openedUnitIds->isEmpty() ? collect() : StudyLevel::query()
            ->where('category', 'hsk')
            ->whereHas('units', fn ($q) => $q->whereIn('id', $openedUnitIds))
            ->withCount('units')
            ->orderBy('title')
            ->get()
            ->map(function (StudyLevel $l) use ($openedUnitIds) {
                $opened = $l->units()->whereIn('id', $openedUnitIds)->count();

                return [
                    'id' => $l->id,
                    'title' => $l->title,
                    'image_url' => $l->image_url,
                    'percent' => $l->units_count ? (int) round($opened / $l->units_count * 100) : 0,
                ];
            })
            ->values();

        return response()->json([
            'name' => $user->name,
            'email' => $user->email,
            'is_admin' => (bool) $user->is_admin,
            'member_since' => $user->created_at,
            'level' => $level,
            'books' => $books,
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
            'tutors' => ($mine = $this->tutorsFor($user))['tutors'],
            'hidden_tutors' => $mine['hidden'],
            'courses' => $this->coursesFor($user),
            // Drives the "Tutor profile" link — absent for most accounts.
            'tutor_profile_id' => optional($user->tutorProfile)->id,
        ]);
    }

    /**
     * Tutors this student actually has a relationship with, each with where
     * things stand: a lesson coming up, a request waiting on the tutor, or the
     * last lesson they had.
     *
     * What counts: a confirmed lesson (past or future) or a PAID request whose
     * time has not passed. An unpaid hold is not a relationship, and neither
     * is a request that lapsed with no answer, or anything cancelled/declined.
     * Bookings the student cleared from their Past list are left out too.
     *
     * A tutor is `done` when nothing is coming up; only then may the student
     * hide them. A hidden tutor reappears on its own once a new lesson is
     * booked, because hiding a done tutor never hides a live one.
     */
    private function tutorsFor($user): array
    {
        $now = now();
        $bookings = Booking::where('student_id', $user->id)
            ->whereIn('status', ['pending', 'confirmed'])
            ->whereNull('hidden_for_student_at')
            ->whereNotNull('starts_at')
            ->get(['tutor_id', 'status', 'starts_at']);

        $byTutor = [];
        foreach ($bookings as $b) {
            $future = $b->starts_at->gt($now);
            // A pending request whose time has passed was never answered.
            if ($b->status === 'pending' && ! $future) {
                continue;
            }
            $t = &$byTutor[(int) $b->tutor_id];
            $t ??= ['next' => null, 'waiting' => null, 'last' => null];
            if ($future && $b->status === 'confirmed' && (! $t['next'] || $b->starts_at->lt($t['next']))) {
                $t['next'] = $b->starts_at;
            } elseif ($future && $b->status === 'pending' && (! $t['waiting'] || $b->starts_at->lt($t['waiting']))) {
                $t['waiting'] = $b->starts_at;
            } elseif (! $future && (! $t['last'] || $b->starts_at->gt($t['last']))) {
                $t['last'] = $b->starts_at;
            }
            unset($t);
        }

        if (! $byTutor) {
            return ['tutors' => [], 'hidden' => []];
        }

        $hiddenIds = HiddenTutor::where('user_id', $user->id)->pluck('tutor_id')->map(fn ($id) => (int) $id)->all();

        $rows = User::whereIn('id', array_keys($byTutor))
            ->with('tutorProfile:id,user_id,photo_path')
            ->get()
            ->map(function (User $tu) use ($byTutor, $hiddenIds) {
                $s = $byTutor[$tu->id];
                $done = ! $s['next'] && ! $s['waiting'];

                return [
                    'id' => $tu->id,
                    'name' => $tu->name,
                    'profile_id' => optional($tu->tutorProfile)->id,
                    'photo_url' => $tu->avatar_url ?: optional($tu->tutorProfile)->photo_url,
                    // Sent as UTC; the browser words them in the reader's time.
                    'next_lesson_at' => $s['next']?->toIso8601String(),
                    'waiting_since' => $s['waiting']?->toIso8601String(),
                    'last_lesson_at' => $s['last']?->toIso8601String(),
                    'done' => $done,
                    'hidden' => $done && in_array($tu->id, $hiddenIds, true),
                ];
            })
            // Something coming up first (soonest first), then most recent past.
            ->sortBy(fn ($r) => $r['next_lesson_at'] ?? $r['waiting_since']
                ? '0'.($r['next_lesson_at'] ?? $r['waiting_since'])
                : '1'.(9999999999 - strtotime($r['last_lesson_at'] ?? '1970-01-01')))
            ->values();

        return [
            'tutors' => $rows->where('hidden', false)->values()->all(),
            'hidden' => $rows->where('hidden', true)->values()->all(),
        ];
    }

    /** Hide a finished tutor from the Profile list. Refused while anything is coming up. */
    public function hideTutor(Request $request, User $tutor)
    {
        $user = $request->user();
        $row = collect($this->tutorsFor($user)['tutors'])->firstWhere('id', $tutor->id);

        if (! $row) {
            return response()->json(['message' => 'That tutor is not on your list.'], 404);
        }
        if (! $row['done']) {
            return response()->json(['message' => 'You have a lesson coming up with this tutor.'], 422);
        }

        HiddenTutor::firstOrCreate(['user_id' => $user->id, 'tutor_id' => $tutor->id]);

        return response()->json($this->tutorsFor($user));
    }

    public function unhideTutor(Request $request, User $tutor)
    {
        HiddenTutor::where('user_id', $request->user()->id)->where('tutor_id', $tutor->id)->delete();

        return response()->json($this->tutorsFor($request->user()));
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
    public function updateAvatar(Request $request, ProfilePhotoService $photos)
    {
        $request->validate([
            'avatar' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
        ]);

        return response()->json($photos->replace($request->user(), $request->file('avatar')));
    }

    /** Remove it and fall back to the initial. */
    public function deleteAvatar(Request $request, ProfilePhotoService $photos)
    {
        return response()->json($photos->clear($request->user()));
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
