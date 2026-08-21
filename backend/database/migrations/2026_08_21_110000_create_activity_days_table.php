<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('activity_days', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Stored as a plain Y-m-d string: the chart buckets by calendar day
            // in the user's own reckoning, and a datetime would invite timezone
            // arithmetic on every read.
            $table->date('day');
            // Seconds, not minutes — a minute-granularity counter loses most of
            // a short visit, and the chart divides down to hours anyway.
            $table->unsignedInteger('seconds')->default(0);
            // When this row last received a heartbeat. The server credits the
            // gap between beats rather than trusting a client-sent duration,
            // so this is what makes the total impossible to inflate.
            $table->timestamp('last_beat_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'day']);
            $table->index(['user_id', 'day']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('activity_days');
    }
};
