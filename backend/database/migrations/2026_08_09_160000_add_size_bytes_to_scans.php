<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Documents table shows a File Size column. The size has to be recorded at
 * upload time because store() deletes the image as soon as OCR finishes, so it
 * cannot be read back off disk later. Nullable: scans taken before this
 * migration have no size to recover and render as an em dash.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('scans', function (Blueprint $table) {
            $table->unsignedBigInteger('size_bytes')->nullable();
        });
    }

    public function down()
    {
        // SQLite 3.33 here predates ALTER TABLE DROP COLUMN and doctrine/dbal
        // is not installed; the column is nullable and harmless if left.
    }
};
