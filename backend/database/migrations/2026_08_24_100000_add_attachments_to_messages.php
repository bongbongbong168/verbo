<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('messages', function (Blueprint $table) {
            /*
             * One attachment per message — the composer offers a single paperclip
             * and a chat message with a list of files is a different product.
             *
             * The path is on the PRIVATE disk, not `public`: these are messages
             * between two people, so a guessable URL that anyone could open
             * would leak them. They are streamed through a controller that runs
             * the same access check as the thread itself.
             */
            $table->string('attachment_path')->nullable();
            $table->string('attachment_name')->nullable();   // the original filename
            $table->string('attachment_mime')->nullable();
            $table->unsignedInteger('attachment_size')->nullable();
        });
    }

    public function down()
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn([
                'attachment_path',
                'attachment_name',
                'attachment_mime',
                'attachment_size',
            ]);
        });
    }
};
