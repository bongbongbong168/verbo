<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reader interactions: likes, bookmarks, comments, views and shares.
 *
 * Each is its own table rather than flags on a pivot, because they carry
 * different data and are read in different ways — comments have text and
 * threading, views are append-only history, likes and bookmarks are one row per
 * pair and nothing else.
 */
return new class extends Migration
{
    public function up()
    {
        // One like per user per article — the unique index is what enforces
        // that, not the controller, so a double-tap cannot create two rows.
        Schema::create('article_likes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('article_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'article_id']);
            // "how many likes does this article have"
            $table->index('article_id');
        });

        Schema::create('article_bookmarks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('article_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'article_id']);
            // "My Saved Articles", newest first.
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('article_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('article_id')->constrained()->cascadeOnDelete();
            /* Replies are ONE level deep. A reply points at a top-level
               comment; the controller refuses to let a reply be a parent, which
               is what keeps this from turning into an unbounded tree. */
            $table->foreignId('parent_id')->nullable()
                ->constrained('article_comments')->cascadeOnDelete();
            $table->text('content');
            $table->timestamps();

            $table->index(['article_id', 'created_at']);
            $table->index('parent_id');
        });

        /* Reading history. One row per user per article with a count, rather
           than an append-only log: the recommender only asks "has this person
           read things like this", and an unbounded log would grow forever for
           an answer that never needs more than the latest visit. */
        Schema::create('article_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('article_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('views')->default(1);
            $table->timestamp('last_viewed_at');
            $table->timestamps();

            $table->unique(['user_id', 'article_id']);
            $table->index(['user_id', 'last_viewed_at']);
        });

        // Analytics only — deliberately NOT fed into recommendation scoring:
        // sharing something does not mean you personally want more of it.
        Schema::create('article_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('article_id')->constrained()->cascadeOnDelete();
            $table->string('platform')->nullable();
            $table->timestamps();

            $table->index(['article_id', 'created_at']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('article_shares');
        Schema::dropIfExists('article_views');
        Schema::dropIfExists('article_comments');
        Schema::dropIfExists('article_bookmarks');
        Schema::dropIfExists('article_likes');
    }
};
