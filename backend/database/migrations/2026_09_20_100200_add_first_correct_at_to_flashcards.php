<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * When a word was first answered CORRECTLY, which is what "learn a word"
 * means here. Saving a word is not learning it - a learner can save a page
 * of words in a minute - so the quest counts the first time you got one
 * right in review. Stamped once and never cleared: learning it is a thing
 * that happened, even if you later forget it (that is what `lapses` records).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('flashcards', function (Blueprint $table) {
            $table->timestamp('first_correct_at')->nullable();
        });
    }

    public function down(): void
    {
        // This machine's SQLite has no DROP COLUMN; see the avatar migration.
        throw new RuntimeException('Rolling back first_correct_at needs a table rebuild.');
    }
};
