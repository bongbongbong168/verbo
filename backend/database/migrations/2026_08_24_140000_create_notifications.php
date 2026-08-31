<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * In-app notifications.
 *
 * NOTE: this is the app's OWN table, not Laravel's notification system — there
 * is no queue, no mail driver and no notifiable trait in use here. Do not run
 * `php artisan notifications:table`; it would try to create this same name with
 * a completely different shape (uuid key, morphs, json payload).
 *
 * Rows are written at the moment the event actually happens, from the
 * controller that already handles it. Nothing here is time-based: "your lesson
 * starts in an hour" needs a scheduler, and this app runs no cron.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Who caused it, for the avatar. Nullable because not every
            // notification has a person behind it.
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type');
            $table->string('title');
            $table->text('body')->nullable();
            // Where clicking it goes. A notification that is only information
            // wastes the click — see NotificationController::TYPES.
            $table->string('link')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            // The only two reads: newest for a user, and their unread count.
            $table->index(['user_id', 'created_at']);
            $table->index(['user_id', 'read_at']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('notifications');
    }
};
