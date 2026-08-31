<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        // A tutor's weekly recurring hours. Bookable slots are generated from
        // these rather than stored, so a tutor sets them once instead of
        // topping up a calendar forever.
        Schema::create('tutor_availability', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tutor_profile_id')->constrained()->cascadeOnDelete();
            // 0 = Sunday .. 6 = Saturday, matching Carbon::dayOfWeek.
            $table->unsignedTinyInteger('day_of_week');
            // Wall-clock time in the tutor's own timezone (see the column added
            // to tutor_profiles below) — NOT UTC. A recurring "9am" has to stay
            // 9am for them across a daylight-saving change, which a stored UTC
            // time would not.
            $table->time('start_time');
            $table->time('end_time');
            $table->timestamps();

            $table->index(['tutor_profile_id', 'day_of_week']);
        });

        Schema::table('tutor_profiles', function (Blueprint $table) {
            // Null means "use the app default". Stored per tutor so generated
            // slots mean the same wall-clock hour to the tutor no matter where
            // the student booking them happens to be.
            $table->string('timezone')->nullable();
        });

        Schema::table('bookings', function (Blueprint $table) {
            // A booking is a scheduled lesson now, not a contact request.
            // Nullable so the three existing message-only rows survive.
            $table->timestamp('starts_at')->nullable();
            $table->unsignedSmallInteger('duration_minutes')->nullable();
            // When an unpaid hold lapses. Null once confirmed.
            $table->timestamp('hold_expires_at')->nullable();
            $table->index(['tutor_id', 'starts_at']);
        });

        // Stops two students holding the same slot. Partial, so cancelled and
        // expired rows free the time again — releasing a hold means flipping
        // its status out of this predicate, which needs no cleanup job.
        // Raw SQL: Laravel 9's schema builder has no partial-index helper.
        DB::statement(
            'CREATE UNIQUE INDEX bookings_slot_unique ON bookings (tutor_id, starts_at)
             WHERE starts_at IS NOT NULL AND status IN (\'held\', \'confirmed\')'
        );
    }

    public function down()
    {
        DB::statement('DROP INDEX IF EXISTS bookings_slot_unique');

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropIndex(['tutor_id', 'starts_at']);
            $table->dropColumn(['starts_at', 'duration_minutes', 'hold_expires_at']);
        });

        Schema::table('tutor_profiles', function (Blueprint $table) {
            $table->dropColumn('timezone');
        });

        Schema::dropIfExists('tutor_availability');
    }
};
