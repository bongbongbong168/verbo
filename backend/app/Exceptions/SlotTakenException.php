<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Thrown inside the booking transaction when the chosen window overlaps a
 * booking that already exists.
 *
 * A dedicated type rather than a bare RuntimeException so the catch cannot
 * accidentally swallow an unrelated failure and report it to the student as
 * "someone took that slot", which would be a lie.
 */
class SlotTakenException extends RuntimeException
{
}
