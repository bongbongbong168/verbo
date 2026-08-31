<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The two preference fields the onboarding spec asks for that the table did not
 * already have (§4.5 and §4.6), plus the flag that says a user has been through
 * onboarding.
 *
 * `onboarded_at` lives on `users`, not on `learning_preferences`, because
 * "has this person been asked?" is a different fact from "what did they
 * answer?". Deriving it from the existence of a preferences row would loop
 * forever for anyone who skipped every question — they would be asked again on
 * every load precisely because they chose not to answer.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('learning_preferences', function (Blueprint $table) {
            // Both are single-choice strings validated against a list on the
            // model, matching how `chinese_level` and `hsk_level` already work.
            $table->string('daily_goal')->nullable();
            $table->string('study_time')->nullable();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('onboarded_at')->nullable();
        });
    }

    /**
     * Deliberately throws — this machine's SQLite (3.33) has no
     * `ALTER TABLE DROP COLUMN` and doctrine/dbal is not installed, so a
     * rollback needs a raw-SQL table rebuild. Failing loudly beats failing
     * silently and leaving the schema half-reverted.
     */
    public function down()
    {
        throw new RuntimeException(
            'Irreversible: SQLite here cannot DROP COLUMN. Rebuild learning_preferences and users by hand if this must be undone.'
        );
    }
};
