<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A profile picture for every account.
 *
 * Distinct from `tutor_profiles.photo_path` on purpose: that one is a tutor's
 * marketing photo on Find Tutor, chosen to sell lessons. This is the personal
 * avatar an account carries around the app — in a message row, the account
 * popover, their own profile — and most users are not tutors at all.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('avatar_path')->nullable()->after('email');
        });
    }

    public function down()
    {
        // NOTE: this machine's SQLite (3.33) predates ALTER TABLE DROP COLUMN
        // (3.35+) and doctrine/dbal is not installed, so rolling this back needs
        // the table rebuilt in raw SQL — see the study_grammar_points migration
        // for the pattern. Left unimplemented rather than silently failing.
        throw new \RuntimeException(
            'Rolling back add_avatar_to_users needs a raw-SQL table rebuild on this SQLite version.'
        );
    }
};
