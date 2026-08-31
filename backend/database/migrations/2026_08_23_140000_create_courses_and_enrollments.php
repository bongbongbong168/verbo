<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        /*
         * A group course is the opposite shape to a private lesson: the
         * schedule is fixed by the tutor up front, so a student picks the
         * course and accepts its times rather than choosing a slot. That is
         * why none of this reuses tutor_availability or SlotService — there
         * is nothing to generate, the dates are the product.
         */
        Schema::create('courses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tutor_profile_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('level')->nullable();
            // Newline-separated "what you'll learn" bullets. A list this small
            // does not earn its own table.
            $table->text('outcomes')->nullable();

            // Price is for the WHOLE course, not per class — that is the point
            // of the group product, and why the card says "$80 total".
            $table->unsignedInteger('price');

            $table->unsignedSmallInteger('weeks');
            $table->unsignedSmallInteger('total_classes');
            $table->unsignedTinyInteger('classes_per_week');
            $table->unsignedSmallInteger('minutes_per_class');
            $table->unsignedSmallInteger('capacity');

            $table->date('starts_on');
            $table->date('ends_on');
            // 0 = Sunday .. 6 = Saturday, matching Carbon::dayOfWeek and
            // tutor_availability. Stored as json since a course runs on two or
            // three fixed weekdays.
            $table->json('days_of_week');
            // Wall-clock in the tutor's own timezone, same rule as
            // tutor_availability — a recurring 7pm must stay 7pm for them.
            $table->time('start_time');
            $table->time('end_time');

            $table->timestamps();
            $table->index(['tutor_profile_id', 'starts_on']);
        });

        Schema::create('course_enrollments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // held -> confirmed | cancelled, mirroring bookings so the payment
            // seam works the same way on both flows.
            $table->string('status')->default('held');
            $table->timestamp('hold_expires_at')->nullable();
            $table->timestamps();

            // One enrolment per person per course. Unlike a booking — where a
            // student is meant to come back repeatedly — enrolling twice in the
            // same eight-week course is always a mistake.
            $table->unique(['course_id', 'user_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('course_enrollments');
        Schema::dropIfExists('courses');
    }
};
