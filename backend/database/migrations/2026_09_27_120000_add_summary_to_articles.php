<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* A short admin-written description shown under the article title. Nullable:
   without one the page falls back to the start of the English translation. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('articles', function (Blueprint $table) {
            $table->text('summary')->nullable();
        });
    }

    public function down(): void
    {
        // SQLite 3.33 on the dev machine has no DROP COLUMN; see avatar_path.
        throw new RuntimeException('Rolling back articles.summary needs a table rebuild.');
    }
};
