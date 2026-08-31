<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Turns the flashcard table into the Vocabulary Bank's storage.
 *
 * Two additions, and they answer different questions:
 *
 *  - WHERE a word came from. `source_module` already recorded the kind of place
 *    ("podcast"), which is enough to filter by but not enough to go back to.
 *    `source_type` / `source_id` point at the actual episode, article, unit or
 *    scan, and `example` keeps the sentence it was met in — the two things that
 *    turn a word list into a record of what the learner actually read.
 *
 *  - HOW WELL it is known. The review counters are what make "Learning",
 *    "Mastered" and "difficult words" real rather than labels over nothing.
 *
 * Note there is deliberately no `due_at`: this tracks how a word is going, not
 * when to show it next. Spaced-repetition scheduling is a separate decision.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('flashcards', function (Blueprint $table) {
            // The fully-qualified class, same as `recent_views.viewable_type` —
            // the short key the client sends is mapped through a whitelist on
            // the controller so a caller cannot point a row at any model.
            $table->string('source_type')->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            // Text, not string: a sentence is not a 255-char field.
            $table->text('example')->nullable();

            $table->unsignedInteger('review_count')->default(0);
            // Consecutive correct answers. Mastery is a streak rather than a
            // total, so one lucky answer among many wrong ones does not count.
            $table->unsignedInteger('correct_streak')->default(0);
            // Times answered wrong, ever. This is what "difficult" means, and
            // it must NOT reset with the streak or a word you keep forgetting
            // would look easy the moment you got it right once.
            $table->unsignedInteger('lapses')->default(0);
            $table->timestamp('last_reviewed_at')->nullable();

            // The bank's default view is "this user's words, newest first",
            // and every filter narrows within one user.
            $table->index(['user_id', 'source_module']);
        });
    }

    /**
     * Deliberately throws. This machine's SQLite is 3.33, which has no
     * `ALTER TABLE DROP COLUMN` (3.35+), and doctrine/dbal — which Laravel's
     * `dropColumn` needs on SQLite — is not installed. Rolling this back means
     * rebuilding the table in raw SQL; failing loudly beats failing silently.
     */
    public function down()
    {
        throw new RuntimeException(
            'Irreversible: SQLite here cannot DROP COLUMN. Rebuild the flashcards table by hand if this must be undone.'
        );
    }
};
