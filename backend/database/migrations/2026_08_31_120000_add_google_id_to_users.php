<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a Verbo account to the Google account that signs into it.
 *
 * Deliberately ADDITIVE only. Making `users.password` nullable would be the
 * tidier model for an account that only ever signs in with Google, but this
 * machine's SQLite is 3.33 — no usable ALTER for that — so it would mean
 * rebuilding the `users` table in raw SQL, on the one table every other table
 * points at, against live data. Not worth it: Google accounts get an
 * unguessable random password instead, which nobody ever sees or types.
 *
 * The column is unique because one Google account must map to exactly one
 * Verbo account. Nullable because almost every existing row will never have
 * one, and SQLite/Postgres both allow many NULLs under a unique index.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('google_id')->nullable()->unique()->after('email');
        });
    }

    public function down(): void
    {
        // dropColumn needs doctrine/dbal on SQLite and this machine has neither
        // that nor a modern enough SQLite, so a rollback here would fail
        // silently rather than doing what it says.
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            throw new RuntimeException(
                'Rolling this back on SQLite needs a raw-SQL table rebuild; do it by hand.'
            );
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('google_id');
        });
    }
};
