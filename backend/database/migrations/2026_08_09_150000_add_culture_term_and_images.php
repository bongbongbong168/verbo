<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The culture design (design/study/culture.png) adds two things to the note:
 * a highlighted term shown as its own pill ("农家乐 - nóngjiālè"), and a
 * carousel of photographs rather than a single image.
 *
 * Pinyin is stored rather than derived on read so an admin can override the
 * generated reading — same reasoning as study_text_lines.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('study_units', function (Blueprint $table) {
            $table->string('culture_term')->nullable();
            $table->string('culture_term_pinyin')->nullable();
        });

        Schema::create('study_culture_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('study_unit_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('study_culture_images');

        // SQLite 3.33 here predates ALTER TABLE DROP COLUMN and doctrine/dbal
        // is not installed, so the added columns are left in place on rollback.
        // They are nullable and unused once the app no longer reads them.
    }
};
