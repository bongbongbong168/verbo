<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A student hiding a tutor from their Profile's "My Tutors" list. One row per
 * pair. It only tidies that one list: bookings, messages and the tutor's own
 * records are untouched, and a new upcoming lesson brings the tutor back.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hidden_tutors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('tutor_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'tutor_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hidden_tutors');
    }
};
