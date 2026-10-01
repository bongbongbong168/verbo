<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* One practice quiz per article or podcast, generated the first time a learner
   asks and then shared by everyone, so a page view never costs a request. The
   hash of the source text says when an edit has made the quiz stale. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_quizzes', function (Blueprint $table) {
            $table->id();
            $table->string('quizzable_type');
            $table->unsignedBigInteger('quizzable_id');
            $table->json('questions');
            $table->string('source_hash', 64);
            $table->timestamps();
            $table->unique(['quizzable_type', 'quizzable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_quizzes');
    }
};
