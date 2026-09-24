<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tutor_profiles', function (Blueprint $table) {
            // `languages_spoken` remains for existing records; new profiles
            // store the public teaching languages as a structured list.
            $table->json('teaching_languages')->nullable();
        });
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            throw new RuntimeException('Rolling back tutor teaching languages on SQLite needs a manual table rebuild.');
        }

        Schema::table('tutor_profiles', function (Blueprint $table) {
            $table->dropColumn('teaching_languages');
        });
    }
};
