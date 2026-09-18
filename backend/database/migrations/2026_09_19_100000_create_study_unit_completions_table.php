<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which lessons a learner has finished.
 *
 * Until now nothing recorded this - `recent_views` says a unit was OPENED,
 * which is why the Profile and the plan card both say "opened". A finished
 * lesson is a different fact (someone can open a lesson and leave), so it is
 * its own row rather than a flag squeezed onto a view. One row per pair,
 * enforced by the unique index, so marking twice is harmless.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('study_unit_completions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('study_unit_id')->constrained('study_units')->cascadeOnDelete();
            $table->timestamp('completed_at');
            $table->unique(['user_id', 'study_unit_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('study_unit_completions');
    }
};
