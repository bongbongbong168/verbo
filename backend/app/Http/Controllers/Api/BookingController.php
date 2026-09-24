<?php

namespace App\Http\Controllers\Api;

use App\Models\Notification;
use App\Exceptions\SlotTakenException;
use App\Exceptions\StudentBusyException;
use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Conversation;
use App\Models\CourseEnrollment;
use App\Models\Message;
use App\Models\TutorProfile;
use App\Services\PaymentService;
use App\Services\SlotService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class BookingController extends Controller
{
    /**
     * Write a booking event into the tutor/student thread, opening it if this
     * is the first one.
     *
     * This is what gives a TUTOR someone to reply to. Only a student can start
     * a thread (`ConversationController::withTutor` takes the caller as the
     * student), so before this a student who booked without ever pressing
     * "Message" left their tutor with no way to reach them at all.
     *
     * Failure is swallowed on purpose: a thread that could not be written must
     * never take a real booking down with it. The booking is the transaction;
     * the message is a courtesy on top of it.
     */
    private static function thread(Booking $booking, int $actorId, string $body): void
    {
        try {
            Conversation::forPair((int) $booking->tutor_id, (int) $booking->student_id)
                ->postEvent($actorId, $body);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * What the event line calls the lesson.
     *
     * Deliberately carries NO date or time. `starts_at` is UTC and the two
     * people reading this thread can sit in different zones, so any time
     * formatted into a stored string is wrong for at least one of them — a
     * 9:00 AM lesson in the tutor's zone was writing itself into the thread as
     * "2:00 AM". The context card at the top of the thread already shows when,
     * rendered in each reader's own local time, and it stays correct.
     */
    private static function describe(Booking $booking): string
    {
        return optional($booking->lesson)->name ?? 'a lesson';
    }

    public function index(Request $request)
    {
        return [
            // whereNull hides rows this side has cleared from Past. The row
            // itself survives for the other party.
            'sent' => $request->user()->bookingsAsStudent()
                ->whereNull('hidden_for_student_at')
                // avatar_path and the tutor photo let checkout show the tutor's face.
                ->with(['tutor:id,name,email,avatar_path', 'tutor.tutorProfile:id,user_id,photo_path', 'lesson'])->latest()->get(),
            'received' => $request->user()->bookingsAsTutor()
                ->whereNull('hidden_for_tutor_at')
                ->with(['student:id,name,email', 'lesson'])->latest()->get(),
        ];
    }

    /**
     * Book a lesson at a chosen time.
     *
     * The booking is created as a *hold*: the slot is taken immediately so two
     * students racing for the same time cannot both get it, and it lapses after
     * HOLD_MINUTES if nothing confirms it. Once Stripe is in, the payment
     * webhook is what flips `held` to `confirmed` — nothing else here changes.
     *
     * Length comes from the chosen lesson, so availability is an overlap
     * question rather than an exact-start-time match.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'tutor_id' => ['required', 'integer', 'exists:users,id'],
            'starts_at' => ['required', 'date'],
            'message' => ['nullable', 'string', 'max:2000'],
            'tutor_lesson_id' => ['nullable', 'integer', 'exists:tutor_lessons,id'],
        ]);

        if ((int) $data['tutor_id'] === $request->user()->id) {
            return response()->json(['message' => 'You cannot book yourself.'], 422);
        }

        $startsAt = Carbon::parse($data['starts_at'])->utc()->seconds(0);

        if ($startsAt->isPast()) {
            return response()->json(['message' => 'That time has already passed.'], 422);
        }

        $profile = TutorProfile::where('user_id', $data['tutor_id'])->first();
        abort_unless($profile, 422, 'That tutor is not taking bookings.');

        // Resolve the lesson first: it decides how long the booking runs, and
        // therefore which slots it can occupy.
        $lesson = null;

        if (! empty($data['tutor_lesson_id'])) {
            $lesson = $profile->lessons()->find($data['tutor_lesson_id']);

            // Checked against *this* profile, not just the table — otherwise a
            // client could pass another tutor's lesson id and book its price.
            if (! $lesson) {
                return response()->json(['message' => 'That lesson is not offered by this tutor.'], 422);
            }
        }

        $duration = $lesson->duration_minutes ?? SlotService::DEFAULT_MINUTES;

        // One trial per student per tutor — that is what makes a trial a trial
        // rather than a permanently discounted lesson.
        if ($lesson && $lesson->is_trial && $this->hasUsedTrial($request->user()->id, $profile)) {
            return response()->json([
                'message' => 'You have already booked a trial with this tutor. Pick another lesson.',
            ], 422);
        }

        $slots = app(SlotService::class);

        // The time must be one the tutor actually offers — a client could
        // otherwise post any datetime it liked and book outside their hours.
        $offered = collect($slots->forTutor($profile, 60, $duration))
            ->contains(fn ($slot) => Carbon::parse($slot['starts_at'])->equalTo($startsAt));

        if (! $offered) {
            return response()->json(['message' => 'That time is not available.'], 422);
        }

        try {
            $booking = DB::transaction(function () use ($request, $data, $startsAt, $slots, $profile, $lesson, $duration) {
                // Release lapsed holds for this tutor first: flipping their
                // status out of the partial unique index is what frees the
                // time, so the insert below can succeed. Not narrowed to this
                // exact start any more — a lapsed 60-minute hold can be
                // blocking a slot that begins half an hour later.
                Booking::where('tutor_id', $data['tutor_id'])
                    ->where('status', 'held')
                    ->whereNotNull('hold_expires_at')
                    ->where('hold_expires_at', '<=', now())
                    ->update(['status' => 'expired']);

                // Re-checked inside the transaction, after lapsed holds are
                // released above. The unique index below only catches an
                // identical start time; a 60-minute lesson landing across
                // someone else's 30-minute one shares no start time at all,
                // so overlap has to be checked here.
                if (! $slots->isFree($profile, $startsAt, $duration)) {
                    throw new SlotTakenException();
                }

                // The student's OWN diary, which the tutor-side check above
                // cannot see. Inside the transaction with everything else: two
                // tabs submitting together would otherwise both pass a check
                // made before the write and book the same person twice.
                $clash = $slots->studentConflict($request->user()->id, $startsAt, $duration);

                if ($clash) {
                    throw new StudentBusyException($clash);
                }

                return $request->user()->bookingsAsStudent()->create([
                    'tutor_id' => $data['tutor_id'],
                    'tutor_lesson_id' => $lesson?->id,
                    'message' => $data['message'] ?? null,
                    'status' => 'held',
                    'starts_at' => $startsAt,
                    'duration_minutes' => $duration,
                    'hold_expires_at' => now()->addMinutes(Booking::HOLD_MINUTES),
                ]);
            });
        } catch (SlotTakenException $e) {
            return response()->json(['message' => 'Someone just took that slot.'], 409);
        } catch (StudentBusyException $e) {
            // 422, not 409: nothing is contended and retrying will not help —
            // this is the student's own diary and only they can change it.
            // The times go out as UTC for the client to render locally; the
            // server does not know what zone the student is sitting in.
            return response()->json([
                'message' => 'You already have a lesson at that time.',
                'conflict' => [
                    'id' => $e->clash->id,
                    'starts_at' => Carbon::parse($e->clash->starts_at)->utc()->toIso8601String(),
                    'duration_minutes' => $e->clash->duration_minutes ?: SlotService::DEFAULT_MINUTES,
                    'tutor_name' => optional($e->clash->tutor)->name,
                    'lesson_name' => optional($e->clash->lesson)->name,
                ],
            ], 422);
        } catch (\Illuminate\Database\QueryException $e) {
            // The unique index is the real guard for an identical start time —
            // two students can pass the availability check at the same instant,
            // and only one insert wins.
            return response()->json(['message' => 'Someone just took that slot.'], 409);
        }

        return response()->json($booking->load(['tutor:id,name,email', 'lesson']), 201);
    }

    /**
     * The student pays.
     *
     * This is the DEMO path, and it now refuses once Stripe is configured. With
     * real keys in place, money must move before a booking becomes a request —
     * otherwise anyone could POST here and take a free lesson. The live path is
     * PaymentController: create an intent, pay it, and let the webhook call
     * `settle()` below.
     *
     * Paying does NOT confirm the lesson: it turns the hold into a `pending`
     * REQUEST the tutor still has to accept. Conflating the two is exactly the
     * bug that let a booking read "Confirmed" before the tutor had seen it.
     */
    public function pay(Request $request, Booking $booking)
    {
        abort_unless((int) $booking->student_id === $request->user()->id, 403);

        abort_if(
            PaymentService::configured(),
            422,
            'Payments are live — this booking must be paid through the checkout.'
        );

        if ($booking->status === 'pending') {
            return response()->json($booking->load('tutor:id,name,email'));
        }

        if ($booking->status !== 'held' || $booking->is_expired) {
            return response()->json(
                ['message' => 'That hold has expired — please pick a time again.'],
                422
            );
        }

        self::settle($booking);

        return response()->json($booking->fresh()->load('tutor:id,name,email'));
    }

    /**
     * Turn a paid hold into a request waiting on the tutor.
     *
     * Split out of `pay` so the Stripe webhook can call it with no Request and
     * no authenticated user — the browser may never come back from the card
     * sheet, so fulfilment cannot depend on it. Idempotent: Stripe retries
     * webhooks, and a second delivery must not notify the tutor twice.
     */
    public static function settle(Booking $booking): void
    {
        if ($booking->status !== 'held') {
            return;
        }

        // hold_expires_at is cleared: it is paid, so it no longer lapses. It
        // waits on the tutor instead.
        $booking->update(['status' => 'pending', 'hold_expires_at' => null]);

        $studentName = optional($booking->student)->name ?? 'A student';

        // The tutor now has something waiting on them — this is the moment the
        // request actually reaches them, not when the hold was created.
        Notification::raise($booking->tutor_id, $booking->student_id, 'booking_requested', [
            'title' => 'New booking request',
            'body' => trim($studentName.' requested '
                .(optional($booking->lesson)->name ?? 'a lesson').'.'),
            'link' => '/bookings',
        ]);

        /* The thread starts here, not at `store`: an unpaid hold lapses in
           fifteen minutes, and opening a conversation for every abandoned one
           would leave the tutor a list of threads about lessons that never
           happened. */
        $student = $studentName;
        self::thread(
            $booking,
            (int) $booking->student_id,
            "{$student} requested ".self::describe($booking).'.'
        );

        /* The note the student typed in the booking dialog is a REAL message
           from them, so it is posted as one — their own words, in a bubble,
           left unread so it reaches the tutor's badge. It was previously stored
           on the booking and shown only on the bookings page, where the tutor
           could read it but not reply to it. */
        if (trim((string) $booking->message) !== '') {
            try {
                $thread = Conversation::forPair(
                    (int) $booking->tutor_id,
                    (int) $booking->student_id
                );
                $thread->messages()->create([
                    'sender_id' => $booking->student_id,
                    'kind' => Message::KIND_TEXT,
                    'body' => trim($booking->message),
                ]);
                $thread->update(['last_message_at' => now()]);
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    /**
     * The tutor accepts the request. Only the tutor — letting the student call
     * this is what made a booking read "Confirmed" before anyone had looked
     * at it.
     */
    public function confirm(Request $request, Booking $booking)
    {
        abort_unless((int) $booking->tutor_id === $request->user()->id, 403);

        // Only a live hold can be confirmed. Checking `is_expired` alone was not
        // enough: once another booking takes the slot, this row has already
        // been flipped to `expired`, so it is no longer "held and past" — it
        // fell through and hit the unique index, which leaked raw SQL back to
        // the caller.
        if (in_array($booking->status, ['pending', 'held'], true)
            && $booking->starts_at !== null && $booking->starts_at->isPast()) {
            return response()->json(['message' => "This lesson's time has already passed."], 422);
        }

        if (! in_array($booking->status, ['pending', 'held'], true) || $booking->is_expired) {
            $reason = [
                'expired' => 'That hold expired and the slot was released — please pick a time again.',
                'cancelled' => 'That booking was cancelled.',
                'confirmed' => 'That booking is already confirmed.',
            ][$booking->status] ?? 'That hold has expired — please pick a time again.';

            return response()->json(['message' => $reason], 422);
        }

        try {
            $booking->update(['status' => 'confirmed', 'hold_expires_at' => null]);
        } catch (\Illuminate\Database\QueryException $e) {
            // Belt and braces: the index is the last word on who owns a slot,
            // and a database error must never reach the client verbatim.
            return response()->json(['message' => 'Someone else has taken that slot.'], 409);
        }

        Notification::raise($booking->student_id, $booking->tutor_id, 'booking_confirmed', [
            'title' => 'Booking accepted',
            'body' => ($request->user()->name ?? 'Your tutor').' accepted your lesson request.',
            'link' => '/bookings',
        ]);

        $tutor = $request->user()->name ?? 'Your tutor';
        self::thread(
            $booking,
            (int) $booking->tutor_id,
            "{$tutor} accepted ".self::describe($booking).'.'
        );

        return response()->json($booking->fresh()->load(['tutor:id,name,email', 'lesson']));
    }

    /**
     * Has this student already taken (or currently hold) a trial with this tutor?
     *
     * Cancelled and expired rows do not count — a trial someone booked and
     * cancelled was never actually used, and refusing them a second one would
     * punish them for changing their mind.
     */
    private function hasUsedTrial(int $studentId, TutorProfile $profile): bool
    {
        return Booking::query()
            ->where('student_id', $studentId)
            ->where('tutor_id', $profile->user_id)
            ->whereIn('status', ['pending', 'held', 'confirmed'])
            ->whereHas('lesson', fn ($q) => $q->where('is_trial', true))
            ->where(function ($q) {
                $q->where('status', '!=', 'held')
                    ->orWhereNull('hold_expires_at')
                    ->orWhere('hold_expires_at', '>', now());
            })
            ->exists();
    }

    /**
     * Clear a finished booking from your own list.
     *
     * Deliberately NOT a delete: the row belongs to both people, so a student
     * tidying their history must not erase the tutor's record of a lesson that
     * actually happened. Only a settled booking can be cleared — hiding one
     * that is still coming up would lose a lesson someone is expecting.
     */
    public function hide(Request $request, Booking $booking)
    {
        $user = $request->user();
        $isTutor = (int) $booking->tutor_id === $user->id;
        $isStudent = (int) $booking->student_id === $user->id;

        abort_unless($isTutor || $isStudent, 403);

        if ($booking->isLive()) {
            return response()->json(
                ['message' => 'Cancel this booking before clearing it from your list.'],
                422
            );
        }

        $booking->update([
            $isTutor ? 'hidden_for_tutor_at' : 'hidden_for_student_at' => now(),
        ]);

        return response()->json(['message' => 'Removed']);
    }

    /**
     * Clear everything settled from one side's Past list, in one call.
     *
     * Scoped by role because that is what the tab shows: as a student you are
     * clearing the lessons you booked and the courses you joined, as a tutor
     * the lessons booked with you. Live rows are left alone by the same rule
     * hide() uses — you cannot lose a lesson someone is still expecting.
     */
    public function clearPast(Request $request)
    {
        $user = $request->user();
        $role = $request->input('role') === 'teacher' ? 'teacher' : 'student';

        // Anything not still live. `expired` counts: a lapsed hold is finished.
        $settled = ['cancelled', 'declined', 'expired'];

        $bookings = Booking::query()
            ->when($role === 'teacher',
                fn ($q) => $q->where('tutor_id', $user->id)->whereNull('hidden_for_tutor_at'),
                fn ($q) => $q->where('student_id', $user->id)->whereNull('hidden_for_student_at'))
            ->where(function ($q) use ($settled) {
                // Settled outright, OR confirmed but already finished, OR a
                // hold whose window has passed.
                $q->whereIn('status', $settled)
                    ->orWhere(fn ($q) => $q->where('status', 'confirmed')->where('starts_at', '<', now()))
                    ->orWhere(fn ($q) => $q->where('status', 'held')->where('hold_expires_at', '<=', now()))
                    // A request never answered before its lesson time
                    // (Booking::is_expired).
                    ->orWhere(fn ($q) => $q->whereIn('status', ['held', 'pending'])->where('starts_at', '<=', now()));
            })
            ->update([$role === 'teacher' ? 'hidden_for_tutor_at' : 'hidden_for_student_at' => now()]);

        $enrollments = 0;
        if ($role === 'student') {
            $enrollments = CourseEnrollment::where('user_id', $user->id)
                ->whereNull('hidden_at')
                ->where(function ($q) {
                    $q->whereIn('status', ['cancelled', 'expired'])
                        ->orWhereHas('course', fn ($c) => $c->where('ends_on', '<', now()));
                })
                ->update(['hidden_at' => now()]);
        }

        return response()->json(['cleared' => $bookings + $enrollments]);
    }

    /**
     * The tutor turns a request down.
     *
     * A distinct status from `cancelled` on purpose: the student needs to know
     * the difference between "you called this off" and "the tutor was not
     * available", and only the second should offer them another time. It frees
     * the slot the same way — `declined` is outside the partial unique index
     * and outside SlotService's taken set, so no cleanup is needed.
     */
    public function decline(Request $request, Booking $booking)
    {
        abort_unless((int) $booking->tutor_id === $request->user()->id, 403);

        if (! in_array($booking->status, ['held', 'pending'], true)) {
            return response()->json(['message' => 'That request is no longer open.'], 422);
        }

        $booking->update([
            'status' => 'declined',
            'decline_reason' => $request->input('reason'),
            'hold_expires_at' => null,
        ]);

        Notification::raise($booking->student_id, $booking->tutor_id, 'booking_declined', [
            'title' => 'Booking declined',
            // The reason is the whole point of `declined` being its own status,
            // so it rides along rather than being left on the bookings page.
            'body' => ($request->user()->name ?? 'Your tutor').' could not take that time.'
                .($request->input('reason') ? ' '.$request->input('reason') : ''),
            'link' => '/bookings',
        ]);

        // A tutor who turns a request down must never keep the money.
        $refunded = PaymentService::refund($booking);

        $tutor = $request->user()->name ?? 'Your tutor';
        self::thread(
            $booking,
            (int) $booking->tutor_id,
            "{$tutor} declined ".self::describe($booking).'.'
                .($request->input('reason') ? ' '.trim($request->input('reason')) : '')
                .($refunded ? ' Your payment has been refunded in full.' : '')
        );

        return response()->json($booking->fresh()->load('student:id,name,email'));
    }

    /** Either side can cancel; cancelling frees the slot for someone else. */
    public function cancel(Request $request, Booking $booking)
    {
        abort_unless(
            (int) $booking->student_id === $request->user()->id
                || (int) $booking->tutor_id === $request->user()->id,
            403
        );

        // Record which side called it off. The student's list reads very
        // differently for "you cancelled this" and "your tutor cancelled on
        // you", and only the second should offer them another time.
        $booking->update([
            'status' => 'cancelled',
            'cancelled_by' => (int) $booking->tutor_id === $request->user()->id ? 'tutor' : 'student',
            'decline_reason' => $request->input('reason'),
            'hold_expires_at' => null,
        ]);

        // Whoever did not press the button is the one who needs telling.
        $actorIsTutor = (int) $booking->tutor_id === $request->user()->id;
        Notification::raise(
            $actorIsTutor ? $booking->student_id : $booking->tutor_id,
            $request->user()->id,
            'booking_cancelled',
            [
                'title' => 'Lesson cancelled',
                'body' => ($request->user()->name ?? 'The other person').' cancelled the lesson.'
                    .($request->input('reason') ? ' '.$request->input('reason') : ''),
                'link' => '/bookings',
            ]
        );

        /* Refunded in full whichever side cancels. The alternative — refunding
           only when the tutor calls it off — needs a cancellation policy stated
           on screen before it can be defended, and there is none. */
        $refunded = PaymentService::refund($booking);

        $actor = $request->user()->name ?? 'The other person';
        self::thread(
            $booking,
            $request->user()->id,
            "{$actor} cancelled ".self::describe($booking).'.'
                .($request->input('reason') ? ' '.trim($request->input('reason')) : '')
                .($refunded ? ' The payment has been refunded in full.' : '')
        );

        return response()->json(['message' => 'Cancelled', 'refunded' => $refunded]);
    }
}
