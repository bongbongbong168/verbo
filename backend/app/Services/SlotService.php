<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\TutorProfile;
use Illuminate\Support\Carbon;

/**
 * Turns a tutor's weekly hours into concrete bookable datetimes.
 *
 * Slots are generated on read rather than stored: weekly hours are the source
 * of truth, so editing them takes effect immediately instead of needing a
 * calendar to be regenerated, and there is no table that silently runs dry
 * when nobody tops it up.
 *
 * Length comes from the lesson being booked, not from a constant. A 60-minute
 * lesson genuinely occupies an hour of the tutor's day, so a booking is a
 * *range* and availability is an overlap question — not the exact-start-time
 * match this used to do.
 */
class SlotService
{
    /** Used when nothing specifies a length — the old fixed trial size. */
    public const DEFAULT_MINUTES = 30;

    /**
     * How far apart consecutive start times are offered.
     *
     * Deliberately independent of lesson length: a 60-minute lesson still
     * offers 9:00, 9:30, 10:00 rather than only 9:00 and 10:00, so a tutor's
     * hours do not strand unusable gaps.
     */
    public const STEP_MINUTES = 30;

    /**
     * @return array<int, array{starts_at: string, local: string, day: string, taken: bool, busy: bool}>
     *
     * `taken` means the tutor is booked; `busy` means THIS student already has
     * something else then. They are kept apart because they are different
     * facts needing different words on screen — "someone got there first"
     * against "you are not free" — and only the second is about the viewer.
     */
    public function forTutor(TutorProfile $tutorProfile, int $days = 14, ?int $durationMinutes = null, ?int $studentId = null): array
    {
        $days = max(1, min($days, 60));
        $duration = max(5, min($durationMinutes ?: self::DEFAULT_MINUTES, 480));
        $tz = $tutorProfile->timezone ?: config('app.timezone');

        $hours = $tutorProfile->availabilitySlots()->get()->groupBy('day_of_week');

        if ($hours->isEmpty()) {
            return [];
        }

        $busy = $this->busyRanges($tutorProfile);
        // Empty when nobody is asking on their own behalf (a logged-out browse),
        // in which case every slot simply reports busy: false.
        $mine = $studentId ? $this->studentBusyRanges($studentId) : [];

        $out = [];
        // Start from now rather than midnight, so a slot that has already begun
        // today is never offered.
        $cursor = Carbon::now($tz);

        for ($d = 0; $d < $days; $d++) {
            $day = Carbon::now($tz)->addDays($d)->startOfDay();
            $rows = $hours->get($day->dayOfWeek);

            if (! $rows) {
                continue;
            }

            foreach ($rows as $row) {
                [$sh, $sm] = array_map('intval', explode(':', $row->start_time));
                [$eh, $em] = array_map('intval', explode(':', $row->end_time));

                $start = $day->copy()->setTime($sh, $sm);
                $end = $day->copy()->setTime($eh, $em);

                // A window ending before it starts is authoring noise, not an
                // overnight shift — skip it rather than looping forever.
                if ($end <= $start) {
                    continue;
                }

                for ($t = $start->copy(); $t->copy()->addMinutes($duration) <= $end; $t->addMinutes(self::STEP_MINUTES)) {
                    if ($t <= $cursor) {
                        continue;
                    }

                    $slotStart = $t->copy()->utc();
                    $slotEnd = $slotStart->copy()->addMinutes($duration);

                    $out[] = [
                        'starts_at' => $slotStart->toIso8601String(),
                        'local' => $t->format('Y-m-d H:i'),
                        'day' => $t->format('Y-m-d'),
                        'taken' => $this->overlapsBusy($slotStart, $slotEnd, $busy),
                        'busy' => $this->overlapsBusy($slotStart, $slotEnd, $mine),
                    ];
                }
            }
        }

        usort($out, fn ($a, $b) => strcmp($a['starts_at'], $b['starts_at']));

        return $out;
    }

    /**
     * Is this exact window free? Used by BookingController before it writes,
     * so the same rule decides what is offered and what is accepted.
     */
    public function isFree(TutorProfile $tutorProfile, Carbon $startsAt, int $durationMinutes, ?int $ignoreBookingId = null): bool
    {
        $start = $startsAt->copy()->utc();
        $end = $start->copy()->addMinutes($durationMinutes);

        return ! $this->overlapsBusy($start, $end, $this->busyRanges($tutorProfile, $ignoreBookingId));
    }

    /**
     * Is this student already committed at this time — to ANY tutor?
     *
     * The tutor-side check above cannot see this: it asks "is Chen free?", and
     * a clash with a lesson the same student booked with Li Ming is invisible
     * to it. Without this, one student could buy two lessons at 7pm from two
     * different tutors and physically attend neither.
     *
     * Returns the clashing booking rather than a bool, so the caller can name
     * it — "you already have a lesson then" is only actionable if it says which.
     */
    public function studentConflict(int $studentId, Carbon $startsAt, int $durationMinutes, ?int $ignoreBookingId = null): ?Booking
    {
        $start = $startsAt->copy()->utc();
        $end = $start->copy()->addMinutes($durationMinutes);

        $bookings = Booking::query()
            ->where('student_id', $studentId)
            ->whereNotNull('starts_at')
            ->when($ignoreBookingId, fn ($q) => $q->where('id', '!=', $ignoreBookingId))
            ->occupying()
            ->with(['lesson:id,name', 'tutor:id,name'])
            ->get();

        foreach ($bookings as $booking) {
            [$busyStart, $busyEnd] = $this->rangeOf($booking);

            if ($start < $busyEnd && $end > $busyStart) {
                return $booking;
            }
        }

        return null;
    }

    /**
     * Windows the tutor is already committed to.
     *
     * Expired holds are left out here as well as by the partial unique index,
     * so a lapsed hold frees its time without waiting for a cleanup pass.
     *
     * @return array<int, array{0: Carbon, 1: Carbon}>
     */
    private function busyRanges(TutorProfile $tutorProfile, ?int $ignoreBookingId = null): array
    {
        return Booking::query()
            ->where('tutor_id', $tutorProfile->user_id)
            ->whereNotNull('starts_at')
            ->when($ignoreBookingId, fn ($q) => $q->where('id', '!=', $ignoreBookingId))
            ->occupying()
            ->get(['starts_at', 'duration_minutes'])
            ->map(fn ($booking) => $this->rangeOf($booking))
            ->all();
    }

    /**
     * Windows this student is already committed to, in the same shape
     * `overlapsBusy` expects, so one slot list can be marked for both sides.
     *
     * @return array<int, array{0: Carbon, 1: Carbon}>
     */
    private function studentBusyRanges(int $studentId): array
    {
        return Booking::query()
            ->where('student_id', $studentId)
            ->whereNotNull('starts_at')
            ->occupying()
            ->get(['starts_at', 'duration_minutes'])
            ->map(fn ($booking) => $this->rangeOf($booking))
            ->all();
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function rangeOf(Booking $booking): array
    {
        $start = Carbon::parse($booking->starts_at)->utc();

        return [$start, $start->copy()->addMinutes($booking->duration_minutes ?: self::DEFAULT_MINUTES)];
    }

    /** Half-open ranges: a lesson ending at 10:00 does not block one starting there. */
    private function overlapsBusy(Carbon $start, Carbon $end, array $busy): bool
    {
        foreach ($busy as [$busyStart, $busyEnd]) {
            if ($start < $busyEnd && $end > $busyStart) {
                return true;
            }
        }

        return false;
    }
}
