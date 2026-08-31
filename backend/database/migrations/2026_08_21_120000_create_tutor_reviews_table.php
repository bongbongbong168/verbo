<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('tutor_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tutor_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->text('body');
            $table->timestamps();

            // One review per person per tutor — posting again edits the one you
            // already left rather than stacking duplicates.
            $table->unique(['tutor_profile_id', 'user_id']);
            // The profile page reads them newest-first.
            $table->index(['tutor_profile_id', 'created_at']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('tutor_reviews');
    }
};
