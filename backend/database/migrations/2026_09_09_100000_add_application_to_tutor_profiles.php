<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Turns a tutor profile into an application that has to be reviewed.
 *
 * The status lives ON `tutor_profiles` rather than in a separate applications
 * table, and that is deliberate: the application IS the profile. A separate
 * table would mean copying every field across on approval and then holding two
 * answers to "what does this tutor teach" — one being reviewed and one being
 * shown — which is exactly how the two drift apart. Reviewing the row that will
 * be published means the admin approves the thing students actually see.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('tutor_profiles', function (Blueprint $table) {
            /* No `default`. A default would mean a row created by any future
               code path silently starts in some state nobody chose; the
               controller sets this explicitly on submit. Existing rows are
               backfilled below. */
            $table->string('status', 20)->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            /* What the admin said. Carries the rejection reason and the
               "please add X" note alike — the applicant needs to know WHY, or
               a rejection is just a closed door. */
            $table->text('review_note')->nullable();

            // --- the application's own fields, beyond what a profile already had
            $table->string('country', 80)->nullable();
            // The tutor's OWN Chinese proficiency.
            $table->string('chinese_level', 40)->nullable();
            // Which learners they teach: Beginner / Intermediate / Advanced / HSK.
            $table->json('teaches_levels')->nullable();
            $table->unsignedSmallInteger('years_experience')->nullable();
            $table->text('teaching_style')->nullable();

            $table->index('status');
        });

        /* GRANDFATHER EVERY EXISTING PROFILE AS APPROVED.
         *
         * Not a convenience — the alternative is destructive. These tutors are
         * already listed, already hold live bookings and already have message
         * threads; defaulting them to `pending` would delist all of them at
         * once, leaving students with confirmed lessons pointing at a tutor who
         * no longer appears to exist. Verification is a rule for new applicants,
         * exactly as `users.onboarded_at` was stamped for accounts that predate
         * onboarding.
         *
         * `submitted_at` / `reviewed_at` stay null: nobody applied and nobody
         * reviewed, and writing a timestamp would invent a review that never
         * happened. The admin queue only reads `pending`, so they never appear
         * there.
         */
        DB::table('tutor_profiles')->whereNull('status')->update(['status' => 'approved']);
    }

    public function down()
    {
        /* This machine's SQLite (3.33) predates ALTER TABLE DROP COLUMN (3.35+)
         * and doctrine/dbal is not installed, so `dropColumn` cannot run here.
         * Throwing is honest; a silent no-op would leave a "rolled back"
         * migration with all its columns still in place. Same choice as the
         * avatar_path migration. */
        throw new RuntimeException(
            'Irreversible on SQLite < 3.35: rebuild tutor_profiles by hand to drop these columns.'
        );
    }
};
