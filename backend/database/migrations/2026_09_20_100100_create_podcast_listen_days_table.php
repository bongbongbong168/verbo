<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Seconds actually LISTENED per day, which the app could not answer before.
 *
 * `podcast_progress.position_seconds` is a POSITION: seek to 4:00 and it
 * reads 240 without a second heard, so a minutes goal could not be honest.
 * The episode page already reports its position every 15s while playing, so
 * the server credits the FORWARD gap between two reports, capped - the same
 * server-side measurement ActivityController::heartbeat uses, and for the
 * same reason: the client must not be able to name the number.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('podcast_listen_days', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('day', 10);
            $table->unsignedInteger('seconds')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'day']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('podcast_listen_days');
    }
};
