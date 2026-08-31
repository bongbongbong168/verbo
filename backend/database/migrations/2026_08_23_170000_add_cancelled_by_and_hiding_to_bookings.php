<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('bookings', function (Blueprint $table) {
            // Who called it off. Without this the student sees the same plain
            // "Cancelled" whether they cancelled or the tutor did — and only
            // one of those should offer them another time.
            $table->string('cancelled_by')->nullable();   // 'student' | 'tutor'

            /*
             * Clearing a row from Past hides it for ONE side, it does not delete
             * it. The row belongs to both people: a student tidying their list
             * must not erase the tutor's record of a lesson that happened.
             */
            $table->timestamp('hidden_for_student_at')->nullable();
            $table->timestamp('hidden_for_tutor_at')->nullable();
        });

        Schema::table('course_enrollments', function (Blueprint $table) {
            $table->timestamp('hidden_at')->nullable();
        });
    }

    public function down()
    {
        Schema::table('course_enrollments', function (Blueprint $table) {
            $table->dropColumn('hidden_at');
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['cancelled_by', 'hidden_for_student_at', 'hidden_for_tutor_at']);
        });
    }
};
