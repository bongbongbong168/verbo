<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fields the level module page needs beyond what the carousel used.
     *
     * study_levels: the hero banner's pill text, its artwork (the angled
     * books-and-CDs shot, distinct from the flat cover used in the carousel)
     * and the banner's background colour, which is keyed to each book.
     *
     * study_units: the lesson label shown beside each module title. Authored
     * rather than derived, because the design skips numbers (第三课 is absent).
     *
     * @return void
     */
    public function up()
    {
        Schema::table('study_levels', function (Blueprint $table) {
            $table->string('level_label')->nullable()->after('description');
            $table->string('banner_path')->nullable()->after('image_path');
            $table->string('accent_color')->nullable()->after('banner_path');
        });

        Schema::table('study_units', function (Blueprint $table) {
            $table->string('lesson_label')->nullable()->after('study_level_id');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('study_levels', function (Blueprint $table) {
            $table->dropColumn(['level_label', 'banner_path', 'accent_color']);
        });

        Schema::table('study_units', function (Blueprint $table) {
            $table->dropColumn('lesson_label');
        });
    }
};
