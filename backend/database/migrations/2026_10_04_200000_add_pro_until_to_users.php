<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pro paid for by ABA KHQR, one month at a time. A KHQR payment does not
 * renew by itself like a Stripe subscription, so it grants Pro until a date.
 * User::getIsProAttribute reads it, so every existing Pro check honours it
 * and an expired month simply stops counting - no job has to switch it off.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('pro_until')->nullable()->after('is_pro');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('pro_until');
        });
    }
};
