<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One in-app notification for one user.
 *
 * Not Laravel's Notification — this app has no queue or mail driver, so rows
 * are written inline by whichever controller handles the event.
 */
class Notification extends Model
{
    use HasFactory;

    /**
     * Every type the app can actually raise, mapped to the category the UI
     * groups by. A type NOT in here cannot be created — see push().
     *
     * Deliberately short: this covers the events that really happen in Verbo
     * today. Study reminders, quiz results, homework and course materials are
     * absent because nothing in the app produces them, and a notification for
     * an event that never fires is just dead code.
     */
    public const TYPES = [
        'booking_requested' => 'tutor',
        'booking_confirmed' => 'tutor',
        'booking_declined' => 'tutor',
        'booking_cancelled' => 'tutor',
        'message' => 'message',
        'course_enrolled' => 'course',
        /* Tutor verification. The applicant is left refreshing a page forever
           otherwise — a decision nobody hears about is not a decision. */
        'tutor_application_approved' => 'tutor',
        'tutor_application_rejected' => 'tutor',
        'tutor_application_needs_info' => 'tutor',
    ];

    protected $fillable = [
        'actor_id',
        'type',
        'title',
        'body',
        'link',
        'read_at',
    ];

    protected $casts = [
        'read_at' => 'datetime',
    ];

    protected $appends = ['category', 'actor_photo_url'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /** The icon/grouping the client switches on. */
    public function getCategoryAttribute(): string
    {
        return self::TYPES[$this->type] ?? 'tutor';
    }

    /**
     * The face of whoever caused this.
     *
     * Same rule as a message row: the account's own picture wins, a tutor's
     * marketing photo is the fallback so seeded tutors still show a face.
     * Null for a notification with no actor, and the client draws its category
     * glyph then — a notification nobody caused has no face to show.
     *
     * Relies on `actor` (and `actor.tutorProfile`) being eager-loaded; both
     * query sites below do that, or this appended attribute would fire two
     * queries per row.
     */
    public function getActorPhotoUrlAttribute(): ?string
    {
        return $this->actor?->avatar_url ?? $this->actor?->tutorProfile?->photo_url;
    }

    /**
     * Raise a notification, or quietly do nothing if there is no one to tell.
     *
     * Never notifies someone about their own action — a tutor confirming a
     * lesson does not need telling that they confirmed it — which is the one
     * rule every caller would otherwise have to remember for itself.
     *
     * Named raise() rather than push(): Eloquent already has a non-static
     * Model::push(), and shadowing it with a static method is a fatal error.
     */
    public static function raise(?int $userId, ?int $actorId, string $type, array $data): void
    {
        if (! $userId || $userId === $actorId) {
            return;
        }

        if (! array_key_exists($type, self::TYPES)) {
            // A typo'd type would otherwise create a row the UI cannot render.
            throw new \InvalidArgumentException("Unknown notification type [{$type}].");
        }

        User::find($userId)?->notifications()->create([
            'actor_id' => $actorId,
            'type' => $type,
            'title' => $data['title'],
            'body' => $data['body'] ?? null,
            'link' => $data['link'] ?? null,
        ]);
    }
}
