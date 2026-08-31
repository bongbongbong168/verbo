<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /*
     * `pending` means paid and waiting on the tutor. It has to occupy the slot
     * exactly like `held` and `confirmed` do — otherwise a student pays, waits
     * for the tutor, and someone else books the same time from under them.
     */
    public function up()
    {
        DB::statement('DROP INDEX IF EXISTS bookings_slot_unique');
        DB::statement(
            "CREATE UNIQUE INDEX bookings_slot_unique ON bookings (tutor_id, starts_at)
             WHERE starts_at IS NOT NULL AND status IN ('held', 'pending', 'confirmed')"
        );
    }

    public function down()
    {
        DB::statement('DROP INDEX IF EXISTS bookings_slot_unique');
        DB::statement(
            "CREATE UNIQUE INDEX bookings_slot_unique ON bookings (tutor_id, starts_at)
             WHERE starts_at IS NOT NULL AND status IN ('held', 'confirmed')"
        );
    }
};
