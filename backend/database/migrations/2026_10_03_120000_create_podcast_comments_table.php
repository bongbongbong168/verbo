<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Comments on a podcast episode - the exact shape of article_comments, with
 * the same one-level reply rule. Its own table rather than a polymorphic one:
 * article_comments already holds live rows, and a cascade on a real foreign
 * key is what removes an episode's thread when the episode is deleted.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('podcast_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('podcast_id')->constrained()->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('podcast_comments')->cascadeOnDelete();
            $table->text('content');
            $table->timestamps();

            $table->index(['podcast_id', 'parent_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('podcast_comments');
    }
};
