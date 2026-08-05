<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * `image_path` holds the textbook cover shown in the level carousel;
     * `category` drives the HSK / Daily use toggle above it. Existing rows
     * default to 'hsk' so nothing disappears from the list.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('study_levels', function (Blueprint $table) {
            $table->string('image_path')->nullable()->after('description');
            $table->string('category')->default('hsk')->after('image_path');
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
            $table->dropColumn(['image_path', 'category']);
        });
    }
};
