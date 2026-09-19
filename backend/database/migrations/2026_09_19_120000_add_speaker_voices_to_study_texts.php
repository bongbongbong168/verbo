<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Which voice each speaker in a conversation gets: {"小明": "boy", "安娜": "girl"}.
 * Null (or a missing name) means the default - speakers alternate boy, girl in
 * the order they first speak - so every existing conversation already has two
 * voices without anyone filling this in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('study_texts', function (Blueprint $table) {
            $table->json('speaker_voices')->nullable();
        });
    }

    public function down(): void
    {
        // This machine's SQLite has no DROP COLUMN; see the avatar migration.
        throw new RuntimeException('Rolling back speaker_voices needs a table rebuild.');
    }
};
