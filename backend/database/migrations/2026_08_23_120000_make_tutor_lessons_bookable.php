<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('tutor_lessons', function (Blueprint $table) {
            // The lesson is the product now, so it carries its own length.
            // Slots are generated against this rather than one fixed step —
            // a 60-minute lesson occupies two of what used to be a "slot".
            $table->unsignedSmallInteger('duration_minutes')->default(30);

            // A flag, not a name. "Trial" typed into the name field enforces
            // nothing; this is what limits a student to one trial per tutor
            // and lets the tutor price it below their regular rate.
            $table->boolean('is_trial')->default(false);
        });

        Schema::table('bookings', function (Blueprint $table) {
            // Which lesson was booked. Nullable because every existing row
            // predates the catalogue being bookable — those stay generic.
            // nullOnDelete, not cascade: deleting a lesson from the price list
            // must not delete the lessons people already booked.
            $table->foreignId('tutor_lesson_id')->nullable()->constrained()->nullOnDelete();
        });

        // Existing rows were all the old fixed-length trial.
        DB::table('bookings')->whereNull('duration_minutes')->update(['duration_minutes' => 30]);
    }

    public function down()
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropForeign(['tutor_lesson_id']);
            $table->dropColumn('tutor_lesson_id');
        });

        Schema::table('tutor_lessons', function (Blueprint $table) {
            $table->dropColumn(['duration_minutes', 'is_trial']);
        });
    }
};
