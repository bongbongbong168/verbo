<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two changes to `podcasts`:
 *
 *   1. `audio_path` becomes NULLABLE, so an episode can be written before it is
 *      recorded. It was NOT NULL, which meant a transcript could not exist
 *      without a file — the episode page already handles a missing one ("No
 *      audio uploaded for this episode"), so the column was stricter than the
 *      app needed.
 *
 *   2. A `category` column, the same TOPIC idea Read carries. Level
 *      (Beginner/Intermediate/Advanced) says how hard an episode is; category
 *      says what it is about. They answer different questions, and the Podcast
 *      page could only cut by the first.
 *
 * SQLite has no ALTER COLUMN and this machine's 3.33 predates the newer ALTER
 * support, while doctrine/dbal — which Laravel's `->change()` needs — is not
 * installed. So the SQLite path rebuilds the table, which is the same approach
 * study_grammar_examples took. Postgres gets the plain ALTER it supports, so
 * the Supabase move needs nothing special.
 */
return new class extends Migration
{
    public function up()
    {
        if (DB::getDriverName() !== 'sqlite') {
            Schema::table('podcasts', function (Blueprint $table) {
                $table->string('category')->nullable()->after('level');
            });
            DB::statement('ALTER TABLE podcasts ALTER COLUMN audio_path DROP NOT NULL');

            return;
        }

        /* Rebuild. Foreign keys are disabled around it because SQLite would
           otherwise re-point users.id at the dropped table midway through and
           cascade the delete — taking every episode with it. */
        DB::statement('PRAGMA foreign_keys = OFF');

        Schema::create('podcasts_rebuild', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            // The change: an episode may exist before its recording does.
            $table->string('audio_path')->nullable();
            $table->text('transcript');
            $table->timestamps();
            $table->string('level')->nullable();
            $table->string('category')->nullable();
            $table->text('bio')->nullable();
            $table->string('image_path')->nullable();
            $table->text('transcript_en')->nullable();
        });

        // Columns named explicitly rather than `SELECT *`: the new table has an
        // extra column, so positional insert would shift every value one left.
        DB::statement('
            INSERT INTO podcasts_rebuild
                (id, user_id, title, audio_path, transcript, created_at, updated_at,
                 level, bio, image_path, transcript_en)
            SELECT
                id, user_id, title, audio_path, transcript, created_at, updated_at,
                level, bio, image_path, transcript_en
            FROM podcasts
        ');

        Schema::drop('podcasts');
        Schema::rename('podcasts_rebuild', 'podcasts');

        DB::statement('PRAGMA foreign_keys = ON');
    }

    public function down()
    {
        /* Deliberately refuses rather than failing quietly. Reversing this
           means putting NOT NULL back on audio_path, which is impossible while
           any episode has no audio — and dropping `category` on SQLite needs
           the same rebuild dance. Rolling this one back is a manual job. */
        throw new RuntimeException(
            'Not reversible: audio_path cannot return to NOT NULL while episodes exist without audio. Rebuild the table by hand if this really has to be undone.'
        );
    }
};
