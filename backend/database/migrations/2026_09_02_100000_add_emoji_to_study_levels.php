<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The mark on a Daily Use situation card.
 *
 * A column rather than a lookup table in the frontend keyed on the title: the
 * titles are admin-authored free text, so a map would break silently the first
 * time somebody renamed "Airport" to "At the Airport". Here it belongs to the
 * topic and travels with it.
 *
 * Nullable, and the client falls back to the topic group's own mark — a
 * situation with no emoji still gets a card that looks finished, so this is
 * decoration that can be filled in later rather than a field that has to be
 * remembered on every create.
 *
 * Deliberately NOT reusing `image_path`. That is a real uploaded cover and a
 * few topics have one; an emoji is a one-character label, and overloading the
 * column would make "has a picture" unanswerable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('study_levels', function (Blueprint $table) {
            $table->string('emoji', 16)->nullable()->after('topic_group');
        });
    }

    public function down(): void
    {
        /* This machine's SQLite (3.33) predates ALTER TABLE DROP COLUMN (3.35+)
           and doctrine/dbal is not installed, so `dropColumn` would fail with a
           confusing driver error. Throwing says what actually has to happen —
           the same treatment the users.avatar_path migration uses. */
        throw new RuntimeException(
            'Rolling this back needs a raw-SQL table rebuild: this SQLite has no ALTER TABLE DROP COLUMN.'
        );
    }
};
