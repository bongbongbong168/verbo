<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who PRESENTS an episode, which is not who uploaded it.
 *
 * The card has been showing `user.name` — the account that happened to create
 * the row — so episodes read as "admin" or, for one of them, "BannerVerify",
 * a throwaway test account. That is a fact about the database, not about the
 * podcast, and it is the wrong thing to put under a title.
 *
 * Nullable, and the card falls back to the account name when it is empty, so
 * nothing that exists today breaks.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::table('podcasts', function (Blueprint $table) {
            $table->string('host')->nullable()->after('bio');
        });
    }

    public function down()
    {
        // Plain column drop is fine on Postgres. On SQLite this needs the
        // table rebuild the previous migration does — see the note there.
        Schema::table('podcasts', function (Blueprint $table) {
            $table->dropColumn('host');
        });
    }
};
