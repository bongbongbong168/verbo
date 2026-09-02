<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Timed transcript lines, so the words can follow the audio.
 *
 * A table rather than a JSON column on `podcasts`: each line is annotated for
 * the hover dictionary exactly as study conversation lines are, and a line is
 * the thing the reader clicks to seek. Both want a row with an id.
 *
 * `podcasts.transcript` STAYS. It is the source the lines are split from, it is
 * what an unsynced episode still renders, and it is what the admin edits. Cues
 * are an addition on top of it, not a replacement — an episode with no cues
 * behaves exactly as it did before this migration.
 *
 * `start_ms` is an integer of milliseconds, not a float of seconds: audio
 * positions arrive from `HTMLMediaElement.currentTime` as floats, and rounding
 * them once on the way in avoids ever comparing two floats for ordering.
 *
 * There is deliberately no `end_ms`. A line ends where the next one starts, so
 * storing both would let the two disagree — and the last line simply runs to
 * the end of the audio, a duration this table has no business knowing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('podcast_cues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('podcast_id')->constrained()->cascadeOnDelete();
            // Authoring order. The reader's order is start_ms, but position is
            // what survives a line whose time has not been stamped yet.
            $table->unsignedInteger('position');
            $table->unsignedInteger('start_ms');
            $table->text('text');
            $table->timestamps();

            // Every read is "all cues for this episode, in order".
            $table->index(['podcast_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('podcast_cues');
    }
};
