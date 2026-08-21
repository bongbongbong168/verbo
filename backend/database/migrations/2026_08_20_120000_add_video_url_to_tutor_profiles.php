<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A link to the tutor's introduction video. Stored as a URL rather than an
 * uploaded file: intro videos are large, and tutors already host them on
 * YouTube or Vimeo. The detail page turns a watch link into an embed.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('tutor_profiles', function (Blueprint $table) {
            $table->string('video_url')->nullable();
        });
    }

    public function down()
    {
        // SQLite 3.33 here predates ALTER TABLE DROP COLUMN and doctrine/dbal
        // is not installed; the column is nullable and harmless if left.
    }
};
