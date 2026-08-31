<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        /*
         * Messaging here is CONTEXT-BASED: a conversation exists because of a
         * tutoring relationship or a course, never because one user searched
         * for another. There is deliberately no student-to-student type.
         */
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->string('type');                                  // 'tutor' | 'course'
            $table->foreignId('tutor_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('student_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('course_id')->nullable()->constrained()->cascadeOnDelete();
            // Denormalised so the list can sort by recency without touching
            // messages — the one query that would otherwise be N+1.
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();

            /*
             * One conversation per student-tutor pair, and one per course.
             * A new booking must REUSE the existing thread rather than opening
             * a second one, so the history stays in one place — that is the
             * rule these two indexes enforce at the database.
             */
            $table->unique(['tutor_id', 'student_id'], 'conversations_pair_unique');
            $table->unique('course_id', 'conversations_course_unique');
            $table->index('last_message_at');
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->constrained('users')->cascadeOnDelete();
            $table->text('body');
            // Null until the recipient opens the thread. In a course thread
            // this is "the sender's own read state" only — per-member read
            // receipts would need their own table and are not in scope.
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['conversation_id', 'created_at']);
        });

        Schema::table('tutor_profiles', function (Blueprint $table) {
            // A tutor can switch off questions from people who have not booked.
            // Default true: a tutor who has said nothing is reachable.
            $table->boolean('allows_pre_booking_questions')->default(true);
        });
    }

    public function down()
    {
        Schema::table('tutor_profiles', function (Blueprint $table) {
            $table->dropColumn('allows_pre_booking_questions');
        });
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversations');
    }
};
