<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Saved payment methods.
 *
 * THERE IS NO CARD NUMBER COLUMN HERE, AND THAT IS THE WHOLE DESIGN. What a
 * person needs to recognise their own card is the brand, the last four digits
 * and the expiry; what a server needs to charge it is a token from the payment
 * provider. Neither is the number itself, so the number is never sent to this
 * application and there is nowhere for it to land if it were.
 *
 * `provider_ref` is where that token goes once payments are switched on. It is
 * nullable because the demo settle path this app already ships does not produce
 * one — a row without it is a card you can recognise and select, not a card
 * anything can be charged against.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_methods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // What the owner sees. `brand` is derived from the number's own
            // prefix in the browser and validated against a list server-side.
            $table->string('brand', 20);
            $table->string('last4', 4);
            $table->unsignedSmallInteger('exp_month');
            $table->unsignedSmallInteger('exp_year');

            // Optional, so several cards from one bank stay tellable apart.
            $table->string('label', 40)->nullable();

            // The provider's token, once there is a provider. See the note above.
            $table->string('provider_ref')->nullable();

            $table->boolean('is_default')->default(false);
            $table->timestamps();

            // The list is always read for one person, newest default first.
            $table->index(['user_id', 'is_default']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_methods');
    }
};
