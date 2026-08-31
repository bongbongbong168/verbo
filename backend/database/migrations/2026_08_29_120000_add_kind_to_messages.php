<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Booking events are written into the thread, so `kind` separates them from
 * what a person actually typed.
 *
 * Without it an automatic line would render as a chat bubble from the student,
 * claiming they wrote words they never wrote. The column is what lets the page
 * draw it as a centred note instead.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->string('kind', 20)->default('text')->after('sender_id');
        });
    }

    public function down()
    {
        // This machine's SQLite (3.33) predates ALTER TABLE DROP COLUMN (3.35+)
        // and doctrine/dbal — which Laravel's dropColumn needs on SQLite — is
        // not installed. Rolling this back means rebuilding the table in raw
        // SQL; failing loudly beats failing silently.
        throw new RuntimeException(
            'Reverting this migration needs a raw-SQL table rebuild on SQLite 3.33.'
        );
    }
};
