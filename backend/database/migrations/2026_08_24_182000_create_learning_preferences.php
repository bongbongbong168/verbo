<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the user says they want to learn — the first and strongest input to the
 * recommender.
 *
 * Its own table rather than columns on `users`: this is four multi-select lists
 * plus two single values, and most of the app never reads any of it. Keeping it
 * out of `users` also keeps it off every auth payload.
 *
 * The multi-selects are json columns rather than a pivot per field. They are
 * only ever read whole, for one user at a time, to compare against an article's
 * tags — a join table would buy nothing and cost four more tables.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::create('learning_preferences', function (Blueprint $table) {
            $table->id();
            // One row per user; the unique index is what makes updateOrCreate
            // on user_id safe.
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();

            $table->string('chinese_level')->nullable();
            $table->string('hsk_level')->nullable();

            $table->json('goals')->nullable();
            $table->json('focus')->nullable();
            $table->json('interests')->nullable();
            $table->json('styles')->nullable();

            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('learning_preferences');
    }
};
