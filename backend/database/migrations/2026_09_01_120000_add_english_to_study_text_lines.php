<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The English rendering of a conversation line.
 *
 * Per-line, unlike `articles.body_en` and `podcasts.transcript_en`, which are
 * one free-text block each. A dialogue is the one place where line-by-line
 * alignment is genuinely available: each line has exactly one speaker saying
 * exactly one thing, so "服务员: 请问几位？ / How many people?" is a real pairing
 * rather than the guess it would be over a prose passage. That is why Read
 * shows its translation as a separate passage and this can sit inline.
 *
 * Nullable: a conversation with no English is still a valid conversation, and
 * the Translation toggle simply renders disabled for it — same rule as a
 * Chinese-only podcast episode.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('study_text_lines', function (Blueprint $table) {
            $table->text('english')->nullable()->after('pinyin');
        });
    }

    public function down(): void
    {
        // This machine's SQLite predates ALTER TABLE DROP COLUMN, and
        // doctrine/dbal is not installed — a silent no-op would be worse than
        // saying so.
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            throw new RuntimeException(
                'Rolling this back on SQLite needs a raw-SQL table rebuild; do it by hand.'
            );
        }

        Schema::table('study_text_lines', function (Blueprint $table) {
            $table->dropColumn('english');
        });
    }
};
