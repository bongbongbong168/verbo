<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Structured facts a toast needs and the sentence cannot carry: the booking's
 * start (UTC, so the client formats it in the reader's own timezone), the
 * conversation id, a message preview. Nullable: older rows simply have none.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->json('data')->nullable();
        });
    }

    public function down(): void
    {
        // This machine's SQLite has no DROP COLUMN; see avatar_path's migration.
        throw new \RuntimeException('Rolling back notifications.data needs a table rebuild.');
    }
};
