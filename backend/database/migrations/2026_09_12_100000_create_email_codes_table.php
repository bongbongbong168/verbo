<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One-time codes emailed to an address, for both "confirm this is you" on
 * sign-up and "let me back in" on a forgotten password.
 *
 * Keyed on the EMAIL, not on a user id. A reset code has to be issuable for an
 * address whose account we must not confirm exists, and matching on the string
 * is what lets that endpoint answer identically either way. It also means a
 * code survives independently of the row it will eventually verify.
 *
 * Deliberately NOT Laravel's `password_resets` table: that holds one link
 * token per address with no attempt counter and no purpose, and both are
 * needed here — a six-digit code is guessable in a way a 64-character token is
 * not, so the number of tries has to be counted and capped.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::create('email_codes', function (Blueprint $table) {
            $table->id();
            $table->string('email');
            // 'verify' | 'reset'. A code issued to confirm an address must not
            // be spendable on a password reset — different consequences, so
            // they cannot be one pool.
            $table->string('purpose', 20);
            // HASHED, never the digits themselves. This code grants a password
            // reset, so it is a credential: storing it in the clear would make
            // one database read into account takeover. Same reasoning as the
            // password column beside it.
            $table->string('code_hash');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();

            // Every lookup is "the newest live code for this address and
            // purpose", which is exactly this pair.
            $table->index(['email', 'purpose']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('email_codes');
    }
};
