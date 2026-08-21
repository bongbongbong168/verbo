<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('scans', function (Blueprint $table) {
            // Null means private. A value means "anyone holding this token can
            // read the scan without logging in", so it is the only thing
            // standing between the text and the open web — it must be long and
            // random (see ScanController::share), and unique so a lookup by
            // token can never resolve to two scans.
            $table->string('share_token', 64)->nullable()->unique();
        });
    }

    public function down()
    {
        Schema::table('scans', function (Blueprint $table) {
            $table->dropUnique(['share_token']);
            $table->dropColumn('share_token');
        });
    }
};
