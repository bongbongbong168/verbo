<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a listener got to in an episode.
 *
 * Deliberately NOT a column on `recent_views`. That table is polymorphic and
 * answers one question for the whole app — "what did I touch most recently?" —
 * and a playback position is meaningless for an article, a study unit or a
 * scan. Hanging a podcast-only column off it would put a null on every other
 * row and make the shared table carry one module's business.
 *
 * The two are complementary and both are written when an episode is opened:
 * `recent_views` says you were here, this says where you stopped.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::create('podcast_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('podcast_id')->constrained()->cascadeOnDelete();

            $table->unsignedInteger('position_seconds')->default(0);

            /* Stored rather than read off the audio file, so the list page can
               render "6:32 / 12:40" without downloading metadata for every
               episode on it. Nullable because the client only knows it once
               `loadedmetadata` has fired. */
            $table->unsignedInteger('duration_seconds')->nullable();

            /* Finished episodes drop out of "continue listening" instead of
               sitting there at 99% forever. A timestamp rather than a boolean:
               "when did they finish it" is a real question and costs nothing
               extra to keep. */
            $table->timestamp('completed_at')->nullable();

            $table->timestamps();

            // One row per person per episode; `updateOrCreate` relies on it.
            $table->unique(['user_id', 'podcast_id']);
            // The continue-listening query: this user's rows, newest first.
            $table->index(['user_id', 'updated_at']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('podcast_progress');
    }
};
