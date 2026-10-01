<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* When the "quest complete" toast was shown for this quest, so it shows once.
   Progress is still never stored; this only records that we already said so. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_quests', function (Blueprint $table) {
            $table->timestamp('celebrated_at')->nullable();
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Rolling back daily_quests.celebrated_at needs a table rebuild on SQLite 3.33.');
    }
};
