// Which bookings still occupy a tutor's time — and so should still show as
// "Request sent" / block booking again.
//
// This is deliberately shared rather than restated at each call site: the check
// used to be a bare "does a booking to this tutor exist", which meant cancelling
// one left the button reading "Request sent" forever with no way back.

/**
 * Statuses that represent a live booking.
 *
 * `pending` is the legacy message-only shape from before trial scheduling; it
 * is still an outstanding request, so it counts.
 */
const LIVE_STATUSES = ['pending', 'held', 'confirmed']

/**
 * A hold whose window has passed no longer occupies its slot — the server frees
 * it lazily (SlotService and the partial unique index both ignore it), so the
 * row can still read `held` well after it stopped counting. Mirrors
 * `Booking::getIsExpiredAttribute()`, which is an accessor and is not appended
 * to the JSON.
 */
export function isBookingLive(booking) {
  if (!booking || !LIVE_STATUSES.includes(booking.status)) return false

  if (booking.status === 'held' && booking.hold_expires_at) {
    return new Date(booking.hold_expires_at).getTime() > Date.now()
  }

  return true
}

/** Does this user have a live booking with the given tutor (by user id)? */
export function hasLiveBookingWith(sent, tutorUserId) {
  if (!sent || tutorUserId == null) return false

  // SQLite hands foreign keys back as strings, so compare as numbers.
  return sent.some((b) => isBookingLive(b) && Number(b.tutor_id) === Number(tutorUserId))
}
