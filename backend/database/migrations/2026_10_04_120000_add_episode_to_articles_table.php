<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An episode number for serialised pieces (the Novel shelf). Null for every
 * ordinary article. It is what orders a story 1, 2, 3 instead of by publish
 * date, which would show the newest chapter first.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('articles', function (Blueprint $table) {
            $table->unsignedSmallInteger('episode')->nullable()->after('category');
        });
    }

    public function down(): void
    {
        Schema::table('articles', function (Blueprint $table) {
            $table->dropColumn('episode');
        });
    }
};
