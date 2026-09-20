<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * WHICH quests a learner has today, not their progress.
 *
 * Progress stays derived from the rows the app already writes (articles
 * opened, words reviewed, seconds listened) - the rule the plan card was
 * built on. What has to be stored is only the CHOICE: which quest fills each
 * area today, at which difficulty, and how many times it has been swapped,
 * because a choice cannot be recomputed from anything.
 *
 * One row per (user, day, area), so a day is always three quests: one input,
 * one vocabulary, one practice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_quests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // A plain Y-m-d string, like activity_days: a date cast writes
            // back "Y-m-d 00:00:00" and then firstOrCreate never matches.
            $table->string('day', 10);
            $table->string('area', 20);
            $table->string('quest_key', 40);
            $table->string('level', 10)->default('normal');
            $table->unsignedTinyInteger('changes_used')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'day', 'area']);
            $table->index(['user_id', 'day']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_quests');
    }
};
