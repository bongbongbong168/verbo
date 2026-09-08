<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\TutorCredential;
use App\Models\TutorProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * The admin side of tutor verification: the queue, and the decision.
 *
 * Separate from `TutorController` on purpose. That controller is the tutor
 * acting on themselves and students reading a public profile; this one is a
 * different actor doing a different job, and mixing them would put an
 * `is_admin` gate halfway down a file where every other method is public.
 */
class TutorApplicationController extends Controller
{
    /** Evidence a reviewer can actually open. Extension-based, like every other upload here. */
    private const EVIDENCE_MIMES = 'pdf,jpg,jpeg,png,webp,heic,doc,docx';

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()->is_admin, 403);
    }

    /**
     * The review queue.
     *
     * Defaults to what is waiting rather than everything: the question this
     * page answers is "what needs me?", and a list led by a hundred approved
     * tutors buries the three that do.
     */
    public function index(Request $request)
    {
        $this->authorizeAdmin($request);

        $status = $request->query('status', 'awaiting');

        $query = TutorProfile::with(['user:id,name,email', 'reviewer:id,name'])
            ->withCount('credentials');

        if ($status === 'awaiting') {
            $query->awaitingReview();
        } elseif (in_array($status, TutorProfile::STATUSES, true)) {
            $query->where('status', $status);
        }

        /* Oldest first — a queue, not a feed. Someone who applied on Monday
           should not sink below Friday's applicants. Grandfathered rows have a
           null `submitted_at`, so `id` is the tiebreak. */
        return $query->orderByRaw('submitted_at IS NULL, submitted_at ASC')
            ->orderBy('id')
            ->get()
            ->map(fn (TutorProfile $p) => $this->summarise($p));
    }

    /** Counts for the tabs, so the admin sees the backlog without opening it. */
    public function counts(Request $request)
    {
        $this->authorizeAdmin($request);

        return [
            'awaiting' => TutorProfile::awaitingReview()->count(),
            'pending' => TutorProfile::where('status', TutorProfile::PENDING)->count(),
            'needs_info' => TutorProfile::where('status', TutorProfile::NEEDS_INFO)->count(),
            'approved' => TutorProfile::where('status', TutorProfile::APPROVED)->count(),
            'rejected' => TutorProfile::where('status', TutorProfile::REJECTED)->count(),
        ];
    }

    /** One application in full, including the evidence list. */
    public function show(Request $request, TutorProfile $tutorProfile)
    {
        $this->authorizeAdmin($request);

        $tutorProfile->load([
            'user:id,name,email',
            'reviewer:id,name',
            'resumeEntries',
            'credentials',
            'lessons',
        ]);

        return array_merge($tutorProfile->toArray(), [
            /* Shaped by hand rather than dumped: `path` is where the file lives
               on the private disk and is nobody's business outside this server. */
            'credentials' => $tutorProfile->credentials->map(fn (TutorCredential $c) => [
                'id' => $c->id,
                'label' => $c->label,
                'name' => $c->name,
                'mime' => $c->mime,
                'size' => $c->size,
                'created_at' => $c->created_at,
            ]),
        ]);
    }

    /**
     * Approve, reject, or ask for more information.
     *
     * One endpoint for all three because they are one act — a reviewer reaching
     * a decision — and splitting them into three routes would mean three copies
     * of the same authorization, stamping and notification.
     */
    public function decide(Request $request, TutorProfile $tutorProfile)
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'decision' => ['required', Rule::in([
                TutorProfile::APPROVED, TutorProfile::REJECTED, TutorProfile::NEEDS_INFO,
            ])],
            /* REQUIRED for anything that is not an approval. "No" without a
               reason is not a decision the applicant can act on, and asking for
               more information without saying what is worse than silence. */
            'note' => [
                Rule::requiredIf(fn () => $request->input('decision') !== TutorProfile::APPROVED),
                'nullable', 'string', 'max:2000',
            ],
        ]);

        /* A grandfathered profile has no application to decide on. Rejecting
           one would delist a tutor who is mid-term with real students, through
           a queue they were never in. */
        if ($tutorProfile->status === TutorProfile::APPROVED && $tutorProfile->submitted_at === null) {
            return response()->json([
                'message' => 'This tutor predates the application process and has nothing to review.',
            ], 409);
        }

        $tutorProfile->forceFill([
            'status' => $data['decision'],
            'review_note' => $data['note'] ?? null,
            'reviewed_at' => now(),
            'reviewed_by' => $request->user()->id,
        ])->save();

        $this->notifyApplicant($tutorProfile, $request->user()->id, $data['decision']);

        return $this->summarise($tutorProfile->fresh(['user:id,name,email', 'reviewer:id,name']));
    }

    /**
     * Tell the applicant. A decision nobody hears about is not a decision —
     * the applicant is otherwise left refreshing a page forever.
     */
    private function notifyApplicant(TutorProfile $profile, int $actorId, string $decision): void
    {
        [$type, $title, $body] = [
            TutorProfile::APPROVED => [
                'tutor_application_approved',
                'You are now a Verbo tutor',
                'Your application was approved. Your profile is live in Find Tutor and students can book you.',
            ],
            TutorProfile::REJECTED => [
                'tutor_application_rejected',
                'Your tutor application was not approved',
                $profile->review_note,
            ],
            TutorProfile::NEEDS_INFO => [
                'tutor_application_needs_info',
                'More information needed for your tutor application',
                $profile->review_note,
            ],
        ][$decision];

        /* An approval points at the live profile — the thing they want to see.
           Anything else points back at the application, which is where they can
           read the note and resubmit. */
        $link = $decision === TutorProfile::APPROVED
            ? "/find-tutor/{$profile->id}"
            : '/become-a-tutor';

        Notification::raise($profile->user_id, $actorId, $type, [
            'title' => $title,
            'body' => $body,
            'link' => $link,
        ]);
    }

    /** Upload one piece of evidence. The applicant's own route, not the admin's. */
    public function storeCredential(Request $request)
    {
        $profile = $request->user()->tutorProfile;
        abort_unless($profile !== null, 404);

        $data = $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:'.self::EVIDENCE_MIMES],
            'label' => ['nullable', 'string', 'max:120'],
        ]);

        $file = $request->file('file');
        // PRIVATE disk. A certificate carries a real name and often a date of
        // birth; a public URL is readable by anyone who ever obtains it.
        $path = $file->store('tutor-credentials');

        $credential = $profile->credentials()->create([
            'label' => $data['label'] ?? null,
            'name' => $file->getClientOriginalName(),
            'mime' => $file->getClientMimeType(),
            'size' => $file->getSize(),
        ]);
        $credential->forceFill(['path' => $path])->save();

        return response()->json([
            'id' => $credential->id,
            'label' => $credential->label,
            'name' => $credential->name,
            'mime' => $credential->mime,
            'size' => $credential->size,
        ], 201);
    }

    /** Remove a document. The owner only — an admin deleting evidence mid-review would be odd. */
    public function destroyCredential(Request $request, TutorCredential $tutorCredential)
    {
        $profile = $tutorCredential->tutorProfile;
        abort_unless($profile && (int) $profile->user_id === $request->user()->id, 403);

        Storage::delete($tutorCredential->path);
        $tutorCredential->delete();

        return response()->noContent();
    }

    /**
     * Stream one document. The applicant who uploaded it, or an admin.
     *
     * Fetched through here rather than linked, exactly like chat attachments
     * and classroom submissions: the file is on the private disk precisely so
     * that holding its URL is not enough.
     */
    public function showCredential(Request $request, TutorCredential $tutorCredential)
    {
        $profile = $tutorCredential->tutorProfile;
        $owns = $profile && (int) $profile->user_id === $request->user()->id;
        abort_unless($owns || $request->user()->is_admin, 403);
        abort_unless(Storage::exists($tutorCredential->path), 404);

        return Storage::response($tutorCredential->path, $tutorCredential->name);
    }

    /** The row the queue renders. Deliberately not the whole application. */
    private function summarise(TutorProfile $p): array
    {
        return [
            'id' => $p->id,
            'name' => $p->user?->name,
            'email' => $p->user?->email,
            'photo_url' => $p->photo_url,
            'country' => $p->country,
            'chinese_level' => $p->chinese_level,
            'teaches_levels' => $p->teaches_levels,
            'years_experience' => $p->years_experience,
            'subjects' => $p->subjects,
            'status' => $p->status,
            'submitted_at' => $p->submitted_at,
            'reviewed_at' => $p->reviewed_at,
            'reviewed_by' => $p->reviewer?->name,
            'review_note' => $p->review_note,
            'credentials_count' => $p->credentials_count ?? $p->credentials()->count(),
        ];
    }
}
