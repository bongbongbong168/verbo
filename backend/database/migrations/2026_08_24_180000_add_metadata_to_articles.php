<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Learning metadata on articles, so the recommender has something to match on.
 *
 * All nullable and added alongside the existing columns — the five articles
 * already in the table keep working untouched, and `type`
 * (article/story/funfact) is left exactly as it is because the Read page's
 * filter pills are built on it.
 *
 * NOTE: reading time is deliberately NOT a column. It is derived from the body
 * on read (see Article::getReadingMinutesAttribute), because a stored value
 * would silently go stale the first time someone edits the text.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('articles', function (Blueprint $table) {
            // "HSK 3" etc. A plain string, not an enum: this machine's SQLite
            // has no usable ALTER for changing one later.
            $table->string('hsk_level')->nullable()->after('type');
            $table->string('difficulty')->nullable()->after('hsk_level');
            $table->string('category')->nullable()->after('difficulty');
        });

        /**
         * Tags are what the scoring actually matches against. `kind` is what
         * makes the score meaningful — a "Travel" interest and a "Speaking"
         * focus are worth different points, so a flat tag list could not tell
         * them apart.
         */
        Schema::create('article_tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('article_id')->constrained()->cascadeOnDelete();
            $table->string('kind');
            $table->string('value');
            $table->timestamps();

            $table->unique(['article_id', 'kind', 'value']);
            // The recommender reads every tag for a set of articles at once.
            $table->index(['kind', 'value']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('article_tags');

        // Dropping the three columns needs a raw-SQL table rebuild on this
        // machine's SQLite (3.33 — no ALTER TABLE DROP COLUMN), so this fails
        // loudly rather than half-succeeding.
        throw new \RuntimeException(
            'Rolling back add_metadata_to_articles needs a raw-SQL table rebuild on this SQLite version.'
        );
    }
};
