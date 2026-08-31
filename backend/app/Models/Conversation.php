<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A thread that exists because of a tutoring relationship or a course.
 *
 * Two types only. There is no general direct-message type on purpose: a
 * conversation must always be able to answer "why are we talking?", which is
 * what the booking/course context card at the top of the thread is for.
 */
class Conversation extends Model
{
    use HasFactory;

    public const TYPE_TUTOR = 'tutor';
    public const TYPE_COURSE = 'course';

    protected $fillable = ['type', 'tutor_id', 'student_id', 'course_id', 'last_message_at'];

    protected $casts = ['last_message_at' => 'datetime'];

    public function messages()
    {
        return $this->hasMany(Message::class);
    }

    public function tutor()
    {
        return $this->belongsTo(User::class, 'tutor_id');
    }

    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    /**
     * The thread for a tutor/student pair, opened if it does not exist yet.
     *
     * `firstOrCreate` on the pair, guarded by the unique index — the same rule
     * `ConversationController::withTutor` follows, so a booking and a student
     * clicking "Message" land in the SAME thread rather than two.
     */
    public static function forPair(int $tutorId, int $studentId): self
    {
        return self::firstOrCreate(
            ['type' => self::TYPE_TUTOR, 'tutor_id' => $tutorId, 'student_id' => $studentId],
            ['last_message_at' => now()]
        );
    }

    /**
     * Write a booking event into the thread — requested, accepted, declined,
     * cancelled.
     *
     * Marked READ on arrival, deliberately. Every one of these events already
     * raises a notification, and letting it also light the Messages badge would
     * bill one event to the reader twice. The line is here for context: it is
     * what makes the thread say why the two of you are talking, and it is what
     * gives a tutor a thread to reply into without having to start one.
     *
     * `sender_id` is the person who did the thing, so the row still has an
     * author — but `kind` keeps it out of the chat bubbles, because they did
     * not type it.
     */
    public function postEvent(int $actorId, string $body): Message
    {
        $message = $this->messages()->create([
            'sender_id' => $actorId,
            'kind' => Message::KIND_EVENT,
            'body' => $body,
            'read_at' => now(),
        ]);

        $this->update(['last_message_at' => now()]);

        return $message;
    }

    /** Can this user read and post here? */
    public function allows(User $user): bool
    {
        if ($this->type === self::TYPE_TUTOR) {
            return (int) $this->tutor_id === $user->id || (int) $this->student_id === $user->id;
        }

        // A course thread is the assigned tutor plus everyone actually enrolled.
        // A cancelled enrolment loses access, which is why the status is checked
        // rather than merely the existence of a row.
        $course = $this->course;
        if (! $course) {
            return false;
        }

        if ((int) $course->tutorProfile->user_id === $user->id) {
            return true;
        }

        return $course->enrollments()
            ->where('user_id', $user->id)
            ->whereIn('status', ['held', 'confirmed'])
            ->exists();
    }

    /**
     * The booking this thread is currently about.
     *
     * Derived rather than stored on the row: a pair keeps ONE conversation
     * across many bookings, so a `booking_id` column would need rewriting on
     * every new booking and would be wrong the moment that failed. The newest
     * booking between the two is always the right context.
     */
    public function contextBooking(): ?Booking
    {
        if ($this->type !== self::TYPE_TUTOR) {
            return null;
        }

        return Booking::where('tutor_id', $this->tutor_id)
            ->where('student_id', $this->student_id)
            ->with('lesson')
            ->latest('created_at')
            ->first();
    }
}
