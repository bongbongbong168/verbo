<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The English transcript, so the episode page can offer the same Translation
 * switch the reader has. Deliberately the exact shape of `articles.body_en`:
 * one nullable free-text block, NOT per-line pairs.
 *
 * Per-sentence alignment is a different and much larger feature — see the Read
 * notes in CLAUDE.md. Chinese-only episodes stay valid, and the switch renders
 * disabled when this is empty rather than showing a blank pane.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('podcasts', function (Blueprint $table) {
            $table->text('transcript_en')->nullable();
        });
    }

    public function down()
    {
        throw new RuntimeException(
            'Irreversible: SQLite here cannot DROP COLUMN. Rebuild the podcasts table by hand if this must be undone.'
        );
    }
};
