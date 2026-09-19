<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a tutor teaches, as a structured choice rather than one free-text line.
 *
 * `specialties` holds keys from TutorProfile::SPECIALTIES; `main_specialty`
 * is the one of them shown under the tutor's name. `subjects` stays: it is
 * the tutor's own one-line title and older rows depend on it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tutor_profiles', function (Blueprint $table) {
            $table->json('specialties')->nullable();
            $table->string('main_specialty', 40)->nullable();
        });
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            throw new RuntimeException('Rolling back tutor specialties on SQLite needs a manual table rebuild.');
        }

        Schema::table('tutor_profiles', function (Blueprint $table) {
            $table->dropColumn(['specialties', 'main_specialty']);
        });
    }
};
