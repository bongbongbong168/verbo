<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('tutor_resume_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tutor_profile_id')->constrained()->cascadeOnDelete();
            // Which tab the entry appears under. Kept as a plain string validated
            // by an `in:` rule rather than an enum column, since SQLite here has
            // no usable ALTER for changing one later.
            $table->string('section');
            // Free text ("2016 — 2017", "2018") rather than two date columns:
            // the design shows a range as written, and resume dates are often
            // year-only or open-ended.
            $table->string('years')->nullable();
            $table->string('title');
            $table->string('detail')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('tutor_resume_entries');
    }
};
