<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_pro')->default(false)->after('is_admin');
        });

        Schema::table('articles', function (Blueprint $table) {
            $table->boolean('is_premium')->default(false)->after('category');
        });
    }

    public function down(): void
    {
        Schema::table('articles', function (Blueprint $table) {
            $table->dropColumn('is_premium');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_pro');
        });
    }
};
