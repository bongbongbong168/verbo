<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('study_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('study_unit_id')->constrained()->cascadeOnDelete();
            $table->timestamp('last_viewed_at');
            $table->timestamps();

            // One row per user per unit — opening a unit again updates the
            // timestamp rather than piling up a history nothing reads.
            $table->unique(['user_id', 'study_unit_id']);
            // "Where did I leave off" is a per-user sort on this column.
            $table->index(['user_id', 'last_viewed_at']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('study_progress');
    }
};
