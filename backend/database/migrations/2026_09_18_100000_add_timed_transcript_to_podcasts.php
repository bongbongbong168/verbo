<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A synced, word-timed transcript per episode.
 *
 * ON THE PODCAST ROW, NOT A TABLE OF WORDS. The transcript is only ever read
 * whole (the player loads all of it once) and only ever written whole (one
 * import replaces the last), so a row per word would be thousands of inserts
 * per episode to answer a question nobody asks of it. A JSON column also
 * lives in the database, so it survives deploys without the Railway volume
 * rules that uploaded files need.
 *
 * NEXT TO `transcript`, NOT INSTEAD OF IT. `transcript` is the admin's own
 * text and stays exactly as it was; this is what WhisperX heard, with times.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('podcasts', function (Blueprint $table) {
            $table->json('timed_transcript')->nullable();
            // not_processed | processing | completed | failed
            $table->string('timed_transcript_status', 20)->default('not_processed');
            $table->text('timed_transcript_error')->nullable();
            $table->timestamp('timed_transcript_at')->nullable();
        });
    }

    public function down(): void
    {
        /* This machine's SQLite predates ALTER TABLE DROP COLUMN (3.35+), and
           doctrine/dbal is not installed, so dropping columns here needs a raw
           table rebuild. Refuse loudly rather than fail halfway. */
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            throw new RuntimeException('Rolling back timed transcripts on SQLite needs a manual table rebuild.');
        }

        Schema::table('podcasts', function (Blueprint $table) {
            $table->dropColumn(['timed_transcript', 'timed_transcript_status', 'timed_transcript_error', 'timed_transcript_at']);
        });
    }
};
