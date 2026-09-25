<?php

namespace App\Http\Controllers\Api;

use App\Events\ConversationChanged;
use App\Models\CourseEnrollment;
use App\Models\Notification;
use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Course;
use App\Models\Message;
use App\Models\TutorProfile;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use App\Rules\NoUnsafeLinks;

class ConversationController extends Controller
{
    /**
     * Every thread this user may see, in two groups.
     *
     * Deliberately NOT a user directory — there is nobody to browse. You see a
     * tutor thread because you asked or booked, and a course thread because you
     * are enrolled. Student-to-student threads do not exist at all.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $tutorThreads = Conversation::where('type', Conversation::TYPE_TUTOR)
            ->where(fn ($q) => $q->where('tutor_id', $user->id)->orWhere('student_id', $user->id))
            /* `avatar_path` rides along because the appended `avatar_url`
               accessor reads it — selecting only id and name is what left every
               thread row in the list drawing a letter tile. */
            ->with(['tutor:id,name,avatar_path', 'student:id,name,avatar_path'])
            ->get();

        $courseThreads = Conversation::where('type', Conversation::TYPE_COURSE)
            ->whereIn('course_id', $this->courseIdsFor($user))
            ->with('course.tutorProfile.user:id,name')
            ->get();

        return [
            'tutors' => $tutorThreads->sortByDesc('last_message_at')->values()
                ->map(fn ($c) => $this->summarise($c, $user)),
            'courses' => $courseThreads->sortByDesc('last_message_at')->values()
                ->map(fn ($c) => $this->summarise($c, $user)),
        ];
    }

    /** Total unread, for the nav badge. */
    public function unreadCount(Request $request)
    {
        $user = $request->user();

        return [
            'unread' => Message::whereIn('conversation_id', $this->readableIds($user))
                ->where('sender_id', '!=', $user->id)
                ->whereNull('read_at')
                ->count(),
        ];
    }

    /**
     * Open (or start) the thread with a tutor.
     *
     * firstOrCreate on the pair, so a second booking reuses the same thread
     * rather than splitting the history in two. The unique index on
     * (tutor_id, student_id) is what makes that true even under a race.
     */
    public function withTutor(Request $request, TutorProfile $tutorProfile)
    {
        $user = $request->user();
        $tutorUserId = (int) $tutorProfile->user_id;

        if ($tutorUserId === $user->id) {
            return response()->json(['message' => 'You cannot message yourself.'], 422);
        }

        // A tutor who has switched off pre-booking questions is reachable only
        // once a real booking exists between the two.
        $hasBooking = Booking::where('tutor_id', $tutorUserId)
            ->where('student_id', $user->id)
            ->exists();

        if (! $tutorProfile->allows_pre_booking_questions && ! $hasBooking) {
            return response()->json([
                'message' => 'This tutor only takes messages from students who have booked with them.',
            ], 403);
        }

        $conversation = Conversation::firstOrCreate(
            [
                'type' => Conversation::TYPE_TUTOR,
                'tutor_id' => $tutorUserId,
                'student_id' => $user->id,
            ],
            ['last_message_at' => now()]
        );

        return $this->show($request, $conversation);
    }

    /** Open (or start) a course's group thread. */
    public function forCourse(Request $request, Course $course)
    {
        /* Check membership before `firstOrCreate`. Previously an outsider was
           rejected by show() after an empty conversation had already been
           persisted, which could make a course look active to its real
           members. `courseIdsFor` is also what index() uses, so both entry
           points now agree on who may see or start a course thread. */
        $mayAccess = $this->courseIdsFor($request->user())
            ->contains(fn ($id) => (int) $id === (int) $course->id);
        abort_unless($mayAccess, 403);

        $conversation = Conversation::firstOrCreate(
            ['type' => Conversation::TYPE_COURSE, 'course_id' => $course->id],
            ['last_message_at' => now()]
        );

        return $this->show($request, $conversation);
    }

    public function show(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        abort_unless($conversation->allows($user), 403);

        // Opening the thread marks what you were sent as read.
        $marked = $conversation->messages()
            ->where('sender_id', '!=', $user->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        // Tell the sender, so their "Read" appears without a reload. Only
        // when something actually changed: every open would otherwise ping
        // the other side for nothing.
        if ($marked > 0) {
            $this->broadcastConversationChanged($conversation, $user, 'messages.read');
        }

        $booking = $conversation->contextBooking();

        return [
            'id' => $conversation->id,
            'type' => $conversation->type,
            'title' => $this->titleFor($conversation, $user),
            'profile_id' => optional($this->counterpartProfile($conversation, $user))->id,
            'photo_url' => optional($this->counterpartProfile($conversation, $user))->photo_url,
            'role_label' => $conversation->type === Conversation::TYPE_COURSE
                ? 'Group course'
                : ((int) $conversation->tutor_id === $user->id ? 'Student' : 'Chinese Teacher'),
            'course' => $conversation->type === Conversation::TYPE_COURSE
                ? $conversation->course?->only(['id', 'title', 'level', 'starts_on', 'ends_on'])
                : null,
            // The "why are we talking?" card at the top of the thread.
            'booking' => $booking ? [
                'id' => $booking->id,
                'status' => $booking->status,
                'starts_at' => $booking->starts_at,
                'duration_minutes' => $booking->duration_minutes,
                'lesson' => $booking->lesson?->only(['id', 'name', 'price']),
            ] : null,
            'messages' => $conversation->messages()
                /* The sender's tutor profile comes along for `photo_url` —
                   the only place a face is stored in this app. `user_id` and
                   `photo_path` must both be selected: the first is the foreign
                   key the relation matches on, the second is what the appended
                   `photo_url` accessor reads. A student has no profile, so the
                   photo is simply null and the row falls back to an initial. */
                ->with(['sender:id,name,avatar_path', 'sender.tutorProfile:id,user_id,photo_path'])
                ->orderBy('id')
                ->get()
                ->map(fn (Message $m) => [
                    'id' => $m->id,
                    // Reconcile an optimistic send with this saved row after
                    // a refresh or a retry whose first response was lost.
                    'client_id' => $m->client_id,
                    'body' => $m->body,
                    // 'event' is written by the app when a booking changes
                    // state; the page draws it as a note, not a chat bubble.
                    'kind' => $m->kind,
                    'sender_id' => $m->sender_id,
                    'sender_name' => $m->sender?->name,
                    /* The account's own picture wins; a tutor's marketing photo
                       is the fallback so seeded tutors still show a face. */
                    'sender_photo_url' => $m->sender?->avatar_url
                        ?? $m->sender?->tutorProfile?->photo_url,
                    'mine' => (int) $m->sender_id === $user->id,
                    'created_at' => $m->created_at,
                    'read_at' => $m->read_at,
                    // The file itself is fetched separately, through a route
                    // that re-checks access — never a bare storage URL.
                    'attachment' => $m->attachment_path ? [
                        'name' => $m->attachment_name,
                        'mime' => $m->attachment_mime,
                        'size' => $m->attachment_size,
                        'is_image' => $m->is_image,
                    ] : null,
                ]),
        ];
    }

    public function send(Request $request, Conversation $conversation)
    {
        $user = $request->user();
        abort_unless($conversation->allows($user), 403);

        /*
         * Either a body or a file — a picture on its own is a perfectly good
         * message, so requiring text would be wrong. Validated by extension
         * rather than sniffed mimetype: PHP's fileinfo reports some ordinary
         * files with surprising types, which is the same trap podcast audio
         * uploads hit.
         */
        $data = $request->validate([
            // Links are checked against Google Safe Browsing. This is the most
            // exposed surface in the app for it: a message is written by one
            // person and read by another, with nothing in between.
            'body' => ['nullable', 'string', 'max:4000', new NoUnsafeLinks],
            'client_id' => ['nullable', 'string', 'max:64'],
            'file' => [
                'nullable',
                'file',
                'max:10240',
                'mimes:jpg,jpeg,png,gif,webp,pdf,doc,docx,txt,csv,xlsx,ppt,pptx',
            ],
        ]);

        if (blank($data['body'] ?? null) && ! $request->hasFile('file')) {
            return response()->json(['message' => 'Type a message or attach a file.'], 422);
        }

        /* The client may retry after a timeout even though the first request
           reached us. Return the original row before touching an attachment or
           raising another notification, so one press remains one message. */
        if (filled($data['client_id'] ?? null)) {
            $existing = $conversation->messages()
                ->where('sender_id', $user->id)
                ->where('client_id', $data['client_id'])
                ->first();

            if ($existing) {
                return response()->json($this->messagePayload($existing, $user));
            }
        }

        $attachment = null;
        if ($request->hasFile('file')) {
            $upload = $request->file('file');
            $attachment = [
                // The PRIVATE disk. These are messages between two people, so a
                // public URL anyone could guess would leak them.
                /* THE DISK IS NAMED. `FILESYSTEM_DISK` is `public` on the
                   deployed service, so an unqualified `store()` put message
                   attachments on the PUBLIC disk — which `storage:link`
                   publishes at /storage/... with no authentication in front of
                   it. Verified against production: a chat attachment fetched
                   with no token answered 200. The route below re-checks who is
                   asking, and that check is worth nothing if the bytes are also
                   sitting in the web root. */
                'attachment_path' => $upload->store('chat', 'local'),
                'attachment_name' => $upload->getClientOriginalName(),
                'attachment_mime' => $upload->getClientMimeType(),
                'attachment_size' => $upload->getSize(),
            ];
        }

        $message = DB::transaction(function () use ($conversation, $user, $data, $attachment) {
            $m = $conversation->messages()->create(array_merge([
                'sender_id' => $user->id,
                'body' => $data['body'] ?? '',
                'client_id' => $data['client_id'] ?? null,
            ], $attachment ?? []));

            // Denormalised so the thread list can sort by recency without
            // joining messages on every row.
            $conversation->update(['last_message_at' => now()]);

            return $m;
        });

        $this->notifyRecipients($conversation, $user, $data['body'] ?? '', $attachment !== null);
        $this->broadcastConversationChanged($conversation, $user);

        return response()->json($this->messagePayload($message, $user), 201);
    }

    /**
     * Tell the other side a message arrived.
     *
     * A tutor thread has exactly one recipient. A course thread has the tutor
     * plus every live enrolment, so it fans out — but push() drops the sender,
     * so nobody is told about their own message.
     */
    private function notifyRecipients(Conversation $conversation, $sender, string $body, bool $hasFile): void
    {
        // A file with no words would otherwise render an empty quote.
        $preview = trim($body) !== ''
            ? '"'.\Illuminate\Support\Str::limit(trim($body), 80).'"'
            : ($hasFile ? 'Sent an attachment.' : '');

        if ($conversation->type === Conversation::TYPE_COURSE) {
            foreach ($this->recipientIds($conversation, $sender) as $id) {
                Notification::raise($id, $sender->id, 'message', [
                    'title' => 'New message in '.(optional($conversation->course)->title ?? 'your course'),
                    'body' => trim($sender->name.': '.$preview),
                    'link' => '/messages?c='.$conversation->id,
                ]);
            }

            return;
        }

        foreach ($this->recipientIds($conversation, $sender) as $recipient) {
            Notification::raise($recipient, $sender->id, 'message', [
                'title' => 'New message',
                'body' => trim($sender->name.': '.$preview),
                'link' => '/messages?c='.$conversation->id,
            ]);
        }
    }

    /** One message shape for a fresh send and a loaded conversation. */
    private function messagePayload(Message $message, User $viewer): array
    {
        $message->loadMissing(['sender:id,name,avatar_path', 'sender.tutorProfile:id,user_id,photo_path']);

        return [
            'id' => $message->id,
            'client_id' => $message->client_id,
            'body' => $message->body,
            'kind' => $message->kind,
            'sender_id' => $message->sender_id,
            'sender_name' => $message->sender?->name,
            'sender_photo_url' => $message->sender?->avatar_url ?? $message->sender?->tutorProfile?->photo_url,
            'mine' => (int) $message->sender_id === $viewer->id,
            'created_at' => $message->created_at,
            'read_at' => $message->read_at,
            'attachment' => $message->attachment_path ? [
                'name' => $message->attachment_name,
                'mime' => $message->attachment_mime,
                'size' => $message->attachment_size,
                'is_image' => $message->is_image,
            ] : null,
        ];
    }

    /**
     * Stream one attachment.
     *
     * Runs the SAME access check as the thread it belongs to, which is the
     * whole reason these files sit on the private disk: a public URL would be
     * readable by anyone who got hold of it, forever, with no way to revoke.
     */
    public function attachment(Request $request, Message $message)
    {
        abort_unless($message->conversation->allows($request->user()), 403);
        abort_unless($message->attachment_path, 404);
        abort_unless(Storage::disk('local')->exists($message->attachment_path), 404);

        return Storage::disk('local')->response(
            $message->attachment_path,
            $message->attachment_name,
            ['Content-Type' => $message->attachment_mime ?: 'application/octet-stream']
        );
    }

    /**
     * Unsend a message you wrote.
     *
     * The SENDER only — not the recipient, and not the tutor in their own
     * thread. A message is a thing you said, so you may take it back; letting
     * the other side delete it would let them edit the record of a
     * conversation they are also party to.
     *
     * It goes for EVERYONE, unlike clearing a booking from your own list. A
     * booking row is one shared fact two people each keep a view of, so hiding
     * it for one is honest. A message is something one person said to another,
     * and leaving it on the recipient's screen after the writer withdrew it
     * would make "delete" a lie.
     *
     * No tombstone. "This message was deleted" is a claim the app would then
     * have to keep true forever, and it tells the reader exactly what a
     * withdrawn message tells them — that something was there — while denying
     * the writer the thing they asked for.
     */
    public function destroyMessage(Request $request, Message $message)
    {
        $user = $request->user();

        // (int) cast: the FK arrives as a string from SQLite, and a bare !==
        // would refuse the rightful author. Same trap as everywhere else here.
        abort_unless((int) $message->sender_id === $user->id, 403);
        // Still a member of the thread — access can have been revoked since.
        abort_unless($message->conversation->allows($user), 403);

        $conversation = $message->conversation;

        DB::transaction(function () use ($message, $conversation) {
            // The row cascades; the file on disk does not, and an orphaned
            // upload in a private bucket is unreachable and permanent.
            if ($message->attachment_path) {
                Storage::disk('local')->delete($message->attachment_path);
            }

            $message->delete();

            /* `last_message_at` is denormalised for the thread list's sort
               order, so deleting the newest message leaves that column
               pointing at a message that no longer exists — the thread would
               keep its place at the top of the list forever. Recomputed from
               what is actually left, and falling back to when the conversation
               itself was created when the last message goes. */
            $conversation->update([
                'last_message_at' => $conversation->messages()->max('created_at')
                    ?? $conversation->created_at,
            ]);
        });

        $this->broadcastConversationChanged($conversation, $user, 'message.deleted');

        return response()->json(['message' => 'Deleted']);
    }

    /** Every member except the actor, for private push and inbox notices. */
    private function recipientIds(Conversation $conversation, User $actor)
    {
        if ($conversation->type === Conversation::TYPE_COURSE) {
            $ids = CourseEnrollment::where('course_id', $conversation->course_id)
                ->whereIn('status', ['held', 'confirmed'])
                ->pluck('user_id')
                // Course conversations do not carry tutor_id. The tutor lives
                // on the course, so add that actual account explicitly.
                ->push($conversation->course?->tutorProfile?->user_id);
        } else {
            $ids = collect([$conversation->tutor_id, $conversation->student_id]);
        }

        return $ids
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->reject(fn ($id) => $id === (int) $actor->id)
            ->values();
    }

    /**
     * Realtime is an acceleration, not the source of truth. A Pusher outage
     * must never turn a successfully stored message into a failed send.
     */
    private function broadcastConversationChanged(Conversation $conversation, User $actor, string $change = 'message.created'): void
    {
        try {
            ConversationChanged::dispatch(
                $conversation->id,
                $this->recipientIds($conversation, $actor)->all(),
                $change
            );
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    // ---- helpers -------------------------------------------------------

    /**
     * The other party's tutor profile, when there is one.
     *
     * Needed for the "View profile" button and the avatar. Looked up from the
     * tutor side of the thread, not the viewer's — in a tutor thread the person
     * you are looking at is whichever of the two you are not.
     */
    /** The other person in a tutor thread — whoever I am not. */
    private function counterpartUser(Conversation $c, User $user): ?User
    {
        if ($c->type !== Conversation::TYPE_TUTOR) {
            return null;
        }

        return (int) $c->tutor_id === $user->id ? $c->student : $c->tutor;
    }

    /** What a thread row says happened last. */
    private function previewOf(?Message $m): ?string
    {
        if (! $m) {
            return null;
        }

        if (trim((string) $m->body) !== '') {
            return $m->body;
        }

        return $m->attachment_path ? 'Sent an attachment' : null;
    }

    private function counterpartProfile(Conversation $c, User $user): ?TutorProfile
    {
        if ($c->type !== Conversation::TYPE_TUTOR) {
            return $c->course?->tutorProfile;
        }

        // If I am the tutor, the other party is the student and has no profile.
        if ((int) $c->tutor_id === $user->id) {
            return null;
        }

        return TutorProfile::where('user_id', $c->tutor_id)->first();
    }

    private function titleFor(Conversation $c, User $user): ?string
    {
        if ($c->type === Conversation::TYPE_COURSE) {
            return $c->course?->title;
        }

        return (int) $c->tutor_id === $user->id ? $c->student?->name : $c->tutor?->name;
    }

    private function summarise(Conversation $c, User $user): array
    {
        $booking = $c->type === Conversation::TYPE_TUTOR ? $c->contextBooking() : null;

        return [
            'id' => $c->id,
            'type' => $c->type,
            'title' => $this->titleFor($c, $user),
            /* THE ACCOUNT PICTURE WINS, THE TUTOR PHOTO IS THE FALLBACK — the
               rule the message rows already follow, which this list did not. It
               read the tutor PROFILE only, so a student counterpart (who has no
               profile) always came back null and the row drew an initial, while
               that same person's face appeared on every bubble inside the
               thread. Two answers to one question. */
            'photo_url' => $this->counterpartUser($c, $user)?->avatar_url
                ?: optional($this->counterpartProfile($c, $user))->photo_url,
            'subtitle' => $c->type === Conversation::TYPE_COURSE
                ? $c->course?->liveEnrollments()->count().' students'
                : null,
            'last_message_at' => $c->last_message_at,
            /* An attachment with no words is a perfectly good message here, and
               its body is an empty string — so a thread you had just sent a
               picture to read "No messages yet". Say what was actually sent. */
            'preview' => $this->previewOf($c->messages()->latest('id')->first()),
            // Your own messages never count against you.
            'unread' => $c->messages()
                ->where('sender_id', '!=', $user->id)
                ->whereNull('read_at')
                ->count(),
            'booking' => $booking
                ? ['id' => $booking->id, 'status' => $booking->status, 'starts_at' => $booking->starts_at]
                : null,
        ];
    }

    /** Courses this user is in, as tutor or as an enrolled student. */
    private function courseIdsFor(User $user)
    {
        return Course::query()
            ->whereHas('enrollments', fn ($q) => $q->where('user_id', $user->id)
                ->whereIn('status', ['held', 'confirmed']))
            ->orWhereHas('tutorProfile', fn ($q) => $q->where('user_id', $user->id))
            ->pluck('id');
    }

    private function readableIds(User $user)
    {
        return Conversation::query()
            ->where(fn ($q) => $q->where('tutor_id', $user->id)->orWhere('student_id', $user->id))
            ->orWhereIn('course_id', $this->courseIdsFor($user))
            ->pluck('id');
    }
}
