<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Replaces the class's `room` with a `focus` — what the class is working on
 * rather than which building it sits in. Verbo is online, so a room number
 * described nothing a student could use.
 *
 * `room` is deliberately NOT dropped here: this machine's SQLite (3.33) has no
 * `ALTER TABLE DROP COLUMN` and doctrine/dbal is not installed, so removing it
 * would mean a raw-SQL table rebuild. Nothing reads or writes it any more, and
 * it can be dropped in one line once the Postgres move happens.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('classrooms', function (Blueprint $table) {
            $table->string('focus')->nullable();
        });
    }

    public function down()
    {
        throw new RuntimeException(
            'Irreversible: SQLite here cannot DROP COLUMN. Rebuild the classrooms table by hand if this must be undone.'
        );
    }
};
