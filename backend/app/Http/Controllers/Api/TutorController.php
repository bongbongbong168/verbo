<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\TutorProfile;
use App\Models\SavedItem;
use App\Services\ProfilePhotoService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use App\Rules\NoUnsafeLinks;
use App\Support\YouTubeVideo;
use Illuminate\Validation\ValidationException;

class TutorController extends Controller
{
    public function index(Request $request)
    {
        // The aggregates ride along in the same query. Cards on the Dashboard
        // and Find Tutor both show a rating, and fetching it per card would be
        // an N+1 on every page load.
        /* APPROVED ONLY, and via a scope so no listing can forget it — an
           unreviewed applicant appearing here is the exact failure this
           feature exists to prevent. */
        $saved = SavedItem::where('user_id', $request->user()->id)->where('kind', 'tutor')->pluck('item_id')->all();

        return TutorProfile::approved()
            ->with('user:id,name,email')
            ->withCount('reviews')
            ->withAvg('reviews', 'rating')
            ->withMin(['lessons as cheapest_lesson' => fn ($q) => $q->bookablePriced()], 'price')
            ->latest()
            ->get()
            ->map(function ($profile) use ($saved) {
                // withAvg returns a raw float (or null); round it here so the
                // same tutor cannot read 4.67 on a card and 4.7 on their
                // profile. Null means unrated, which the UI shows as "New" —
                // 0 would read as a terrible score rather than no score.
                $profile->reviews_avg_rating = $profile->reviews_avg_rating !== null
                    ? round($profile->reviews_avg_rating, 1)
                    : null;

                /* Resolved here rather than in the client: the cards print the
                   labels, and a client-side copy of the option list is how it
                   drifts from what the validator accepts. Costs no query — the
                   keys are already on the row. */
                $profile->setAttribute('specialty_list', $profile->specialtyList());
                $profile->setAttribute('saved', in_array($profile->id, $saved));

                return $profile;
            });
    }

    /**
     * The caller's own application, plus what the form needs to render.
     *
     * The option lists ride along rather than being duplicated in the client:
     * a hard-coded list there is how it drifts from what the validator accepts,
     * which is the same reason `LearningPreference` ships its own.
     *
     * `profile` is null for someone who has never applied — that is the "not
     * started" state, and it is a different fact from a rejected application.
     */
    public function show(Request $request)
    {
        $profile = $request->user()->tutorProfile;

        if ($profile) {
            $profile->load('credentials');
        }

        return [
            'profile' => $profile ? array_merge($profile->toArray(), [
                /* Hand-shaped: `path` says where the file sits on the private
                   disk and must never leave this server. */
                'credentials' => $profile->credentials->map(fn ($c) => [
                    'id' => $c->id,
                    'label' => $c->label,
                    'name' => $c->name,
                    'mime' => $c->mime,
                    'size' => $c->size,
                ]),
            ]) : null,
            'options' => [
                'chinese_levels' => TutorProfile::CHINESE_LEVELS,
                'teaches_levels' => TutorProfile::TEACHES_LEVELS,
                'specialties' => TutorProfile::specialtyOptions(),
                'teaching_languages' => TutorProfile::TEACHING_LANGUAGES,
            ],
        ];
    }

    /**
     * Validation for the specialty pair, shared by the application and the
     * edit drawer. `$required` is true for a new application: an applicant
     * who says nothing about what they teach cannot be judged.
     */
    private static function specialtyRules(bool $required): array
    {
        return [
            'specialties' => [$required ? 'required' : 'nullable', 'array', $required ? 'min:1' : 'min:0', 'max:'.count(TutorProfile::SPECIALTIES)],
            'specialties.*' => ['distinct', Rule::in(array_keys(TutorProfile::SPECIALTIES))],
            'main_specialty' => ['nullable', 'string', Rule::in(array_keys(TutorProfile::SPECIALTIES))],
        ];
    }

    /** The student-facing fit fields are lists, so a learner can filter an
     * HSK tutor separately from someone who merely happens to speak English. */
    private static function tutorFitRules(bool $required): array
    {
        return [
            'teaches_levels' => [$required ? 'required' : 'nullable', 'array', $required ? 'min:1' : 'min:0', 'max:4'],
            'teaches_levels.*' => ['distinct', Rule::in(array_merge(TutorProfile::TEACHES_LEVELS, ['HSK preparation']))],
            'teaching_languages' => [$required ? 'required' : 'nullable', 'array', $required ? 'min:1' : 'min:0', 'max:'.count(TutorProfile::TEACHING_LANGUAGES)],
            'teaching_languages.*' => ['distinct', Rule::in(TutorProfile::TEACHING_LANGUAGES)],
        ];
    }

    private static function settleTutorFit(array $data): array
    {
        if (array_key_exists('teaches_levels', $data)) {
            $data['teaches_levels'] = array_values(array_unique(array_map(
                fn ($level) => $level === 'HSK preparation' ? 'Intermediate' : $level,
                $data['teaches_levels'] ?? [],
            )));
        }

        if (array_key_exists('teaching_languages', $data)) {
            $data['teaching_languages'] = array_values(array_unique($data['teaching_languages'] ?? []));
            // Preserve the former column as a readable fallback for older
            // clients and imported records. It no longer drives public cards.
            $data['languages_spoken'] = implode(', ', $data['teaching_languages']);
        }

        return $data;
    }

    /** Normalize the one supported intro-video provider into a stable ID. */
    private static function settleIntroVideo(array $data): array
    {
        if (! array_key_exists('video_url', $data)) {
            return $data;
        }

        $url = trim((string) $data['video_url']);

        if ($url === '') {
            $data['video_url'] = null;
            $data['video_id'] = null;

            return $data;
        }

        $videoId = YouTubeVideo::idFromUrl($url);

        if (! $videoId) {
            throw ValidationException::withMessages([
                'video_url' => 'Enter a valid public or unlisted YouTube video link.',
            ]);
        }

        $data['video_id'] = $videoId;
        $data['video_url'] = YouTubeVideo::watchUrl($videoId);

        return $data;
    }

    /**
     * The main specialty must be one of the chosen ones; when it is missing
     * or no longer chosen, the first chosen one takes its place, and an
     * empty choice clears it. Applied only when specialties were sent, so a
     * drawer tab that does not touch them leaves them alone.
     */
    private static function settleMainSpecialty(array $data): array
    {
        if (! array_key_exists('specialties', $data)) {
            unset($data['main_specialty']);

            return $data;
        }

        $chosen = array_values(array_unique($data['specialties'] ?? []));
        $data['specialties'] = $chosen;
        $main = $data['main_specialty'] ?? null;
        $data['main_specialty'] = in_array($main, $chosen, true) ? $main : ($chosen[0] ?? null);

        return $data;
    }

    public function showProfile(Request $request, TutorProfile $tutorProfile)
    {
        /* Filtering the LIST is not enough — this route takes an id, so an
           unapproved profile would still be readable by anyone who guessed or
           kept a URL. The applicant and an admin may see their own pending
           page; to everyone else it does not exist.
           404 rather than 403: a 403 confirms that this particular person
           applied, which is theirs to disclose, not ours. */
        if (! $tutorProfile->is_public
            && (int) $tutorProfile->user_id !== $request->user()->id
            && ! $request->user()->is_admin) {
            abort(404);
        }

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

        /* Resolved for display, main one first — on the model, because the
           Dashboard's cards resolve the same thing. */
        $specialtyList = $tutorProfile->specialtyList();

        return array_merge($tutorProfile->toArray(), [
            'specialty_list' => $specialtyList,
            // For the edit drawer, which may be opened by an admin editing
            // someone else and so cannot rely on GET /tutor-profile.
            'specialty_options' => TutorProfile::specialtyOptions(),
            'teaches_level_options' => TutorProfile::TEACHES_LEVELS,
            'teaching_language_options' => TutorProfile::TEACHING_LANGUAGES,
            'review_count' => $count,
            'review_average' => $count ? round($tutorProfile->reviews->avg('rating'), 1) : null,
            'trial_used' => $trialUsed,
            'cheapest_lesson' => $cheapest,
        ]);
    }

    /**
     * Submit (or resubmit) an application to teach.
     *
     * This used to create a live, publicly listed tutor the instant it was
     * called. It now lodges an APPLICATION: the row is created the same way but
     * carries `status: pending`, and no listing shows it until an admin
     * approves.
     *
     * Resubmission is this same endpoint. Someone asked for more information
     * edits their answers and posts again, which returns them to the queue — a
     * separate "resubmit" route would be the same code under another name.
     *
     * The fields are REQUIRED here where the old profile form left them
     * optional: an application that says nothing cannot be judged, and an
     * empty one reaching the queue wastes the reviewer's time rather than the
     * applicant's.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'bio' => ['required', 'string', 'min:40', 'max:800', new NoUnsafeLinks],
            'short_bio' => ['nullable', 'string', 'max:180', new NoUnsafeLinks],
            'subjects' => ['required', 'string', 'max:255'],
            'hourly_rate' => ['nullable', 'integer', 'min:0'],
            'languages_spoken' => ['nullable', 'string', 'max:255'],
            'availability' => ['nullable', 'string', 'max:255'],
            'photo' => ['nullable', 'image', 'max:10240'],
            'country' => ['required', 'string', 'max:80'],
            'chinese_level' => ['required', 'string', Rule::in(TutorProfile::CHINESE_LEVELS)],
            'years_experience' => ['required', 'integer', 'min:0', 'max:70'],
            'teaching_style' => ['nullable', 'string', 'max:2000', new NoUnsafeLinks],
            // The bio and the intro video are the two fields on a public
            // profile a visitor might follow. One rule covers both: it pulls
            // URLs out of free text, so a plain URL field needs nothing extra.
            'video_url' => ['nullable', 'string', 'max:500', new NoUnsafeLinks],
        ] + self::specialtyRules(true) + self::tutorFitRules(true));

        $data = self::settleMainSpecialty($data);
        $data = self::settleTutorFit($data);
        $data = self::settleIntroVideo($data);

        /* Queried, not read off `$request->user()->tutorProfile`. That is a
           cached relation: once something has touched it earlier in the same
           request it answers from memory, so this guard would be deciding
           against a stale copy of the very column it is guarding. A check that
           can silently read the wrong value is not a check. */
        $existing = $request->user()->tutorProfile()->first();

        /* An APPROVED tutor editing their details must not be pulled off the
           marketplace and put back in the queue — they would vanish from Find
           Tutor mid-term, taking their live bookings with them. Editing a
           published profile is what updateProfile() is for; this path is only
           ever an application. */
        if ($existing && $existing->status === TutorProfile::APPROVED) {
            return response()->json([
                'message' => 'Your profile is already approved. Edit it from your profile page instead.',
            ], 409);
        }

        $photo = $request->file('photo');
        unset($data['photo']);

        $profile = $request->user()->tutorProfile()->updateOrCreate([], $data);

        if ($photo) {
            app(ProfilePhotoService::class)->replace($request->user(), $photo);
            $profile->refresh();
        }

        /* forceFill, NOT part of $data — and the distinction is the security
           boundary, not a style choice. `status` and the review columns are
           deliberately absent from $fillable so an applicant cannot post their
           own approval, and mass assignment therefore DROPS them silently:
           putting them in $data left every application at status null, which is
           what four tests caught. Same trap as setting a foreign key that is
           not fillable through updateOrCreate.
           A resubmission is a fresh request, so the previous decision and its
           note are cleared rather than left to contradict the new state. */
        $profile->forceFill([
            'status' => TutorProfile::PENDING,
            'submitted_at' => now(),
            'reviewed_at' => null,
            'reviewed_by' => null,
            'review_note' => null,
        ])->save();

        return response()->json($profile->load('user:id,name,email'), 200);
    }

    /**
     * Set the photo on any tutor profile. store() above is an upsert keyed on
     * the authenticated user, so a tutor can only ever change their own — which
     * leaves seeded profiles, whose accounts have no usable password, with no
     * way to get a photo at all. Admin-gated, same as the Read/Study writes.
     */
    public function updatePhoto(Request $request, TutorProfile $tutorProfile, ProfilePhotoService $photos)
    {
        abort_unless($request->user()->is_admin, 403);

        $request->validate([
            'photo' => ['required', 'image', 'max:10240'],
        ]);

        $photos->replace($tutorProfile->user, $request->file('photo'));

        return response()->json($tutorProfile->fresh()->load('user:id,name,email'));
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
    public function updateProfile(Request $request, TutorProfile $tutorProfile, ProfilePhotoService $photos)
    {
        self::authorizeProfile($request, $tutorProfile);

        $data = $request->validate([
            'bio' => ['nullable', 'string', 'max:800', new NoUnsafeLinks],
            'short_bio' => ['nullable', 'string', 'max:180', new NoUnsafeLinks],
            'subjects' => ['nullable', 'string', 'max:255'],
            'hourly_rate' => ['nullable', 'integer', 'min:0'],
            'languages_spoken' => ['nullable', 'string', 'max:255'],
            'teaches_levels' => ['nullable', 'array', 'max:4'],
            'teaches_levels.*' => [Rule::in(array_merge(TutorProfile::TEACHES_LEVELS, ['HSK preparation']))],
            'teaching_languages' => ['nullable', 'array', 'max:'.count(TutorProfile::TEACHING_LANGUAGES)],
            'teaching_languages.*' => [Rule::in(TutorProfile::TEACHING_LANGUAGES)],
            'specialties' => ['nullable', 'array', 'max:'.count(TutorProfile::SPECIALTIES)],
            'specialties.*' => ['distinct', Rule::in(array_keys(TutorProfile::SPECIALTIES))],
            'main_specialty' => ['nullable', 'string', Rule::in(array_keys(TutorProfile::SPECIALTIES))],
            'availability' => ['nullable', 'string', 'max:255'],
            'photo' => ['nullable', 'image', 'max:10240'],
            // The bio and the intro video are the two fields on a public
            // profile a visitor might follow. One rule covers both: it pulls
            // URLs out of free text, so a plain URL field needs nothing extra.
            'video_url' => ['nullable', 'string', 'max:500', new NoUnsafeLinks],
        ]);

        $data = self::settleMainSpecialty($data);
        $data = self::settleTutorFit($data);
        $data = self::settleIntroVideo($data);

        $photo = $request->file('photo');
        unset($data['photo']);

        $tutorProfile->update($data);

        if ($photo) {
            $photos->replace($tutorProfile->user, $photo);
        }

        return $this->showProfile($request, $tutorProfile->fresh());
    }

    /**
     * Set a profile's teaching specialties and which one is the main.
     *
     * Its own JSON endpoint rather than a field on updateProfile(): that one is
     * multipart for the photo, and multipart has no way to send an EMPTY list,
     * so a tutor could never clear their last specialty through it.
     */
    public function updateSpecialties(Request $request, TutorProfile $tutorProfile)
    {
        self::authorizeProfile($request, $tutorProfile);

        $data = $request->validate(array_merge(
            self::specialtyRules(false),
            self::tutorFitRules(false),
        ));
        $data = self::settleMainSpecialty($data + ['specialties' => []]);
        $data = self::settleTutorFit($data);

        $tutorProfile->update($data);

        return $this->showProfile($request, $tutorProfile->fresh());
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
