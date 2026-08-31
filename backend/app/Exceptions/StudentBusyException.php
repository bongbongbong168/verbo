<?php

namespace App\Exceptions;

use App\Models\Booking;
use RuntimeException;

/**
 * Thrown inside the booking transaction when the student is already committed
 * at the chosen time — to this tutor or, more usually, to a different one.
 *
 * Distinct from SlotTakenException on purpose. "Someone just took that slot"
 * and "you already have a lesson then" are different problems with different
 * remedies: the first is bad luck and the student should pick another time,
 * the second is their own diary and they may want to cancel what they have.
 * Reporting either as the other would send them looking in the wrong place.
 *
 * Carries the clashing booking so the response can name it — being told you
 * are busy without being told by what is not actionable.
 */
class StudentBusyException extends RuntimeException
{
    public Booking $clash;

    public function __construct(Booking $clash)
    {
        parent::__construct('You already have a lesson at that time.');

        $this->clash = $clash;
    }
}
