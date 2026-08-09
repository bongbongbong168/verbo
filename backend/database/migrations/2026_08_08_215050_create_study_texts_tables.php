<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    /**
     * A unit's reading is a set of conversations ("Text 1", "Text 2"...),
     * each a sequence of speaker lines. The old single `reading` column stays
     * put so existing units keep rendering until their content is moved over.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('study_texts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('study_unit_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });

        Schema::create('study_text_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('study_text_id')->constrained()->cascadeOnDelete();
            $table->string('speaker')->nullable();
            $table->text('chinese');
            $table->text('pinyin')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('study_text_lines');
        Schema::dropIfExists('study_texts');
    }
};
