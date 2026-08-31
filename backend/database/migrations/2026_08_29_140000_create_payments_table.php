<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The app's record of money moving. There was none before this.
 *
 * Deliberately separate from `bookings` and `course_enrollments` rather than a
 * handful of columns on each: a payment has its own lifecycle (intent created →
 * succeeded → refunded) that does not match the thing it pays for, both flows
 * need the identical shape, and a refund needs somewhere to record its own id.
 *
 * `stripe_payment_intent_id` is UNIQUE, which is what makes webhook delivery
 * idempotent — Stripe retries, and a retry must update the same row rather than
 * fulfilling a booking twice.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Booking | CourseEnrollment. A whitelist in PaymentService keeps
            // this from being a free-form morph the client can point anywhere.
            $table->string('payable_type');
            $table->unsignedBigInteger('payable_id');

            $table->string('stripe_payment_intent_id')->unique();
            $table->string('stripe_refund_id')->nullable();

            // Smallest currency unit (cents), never dollars — storing 12.5 as a
            // float is how rounding errors get into money.
            $table->unsignedInteger('amount');
            $table->string('currency', 3)->default('usd');

            // Mirrors Stripe's own vocabulary so the two never need translating:
            // requires_payment_method | processing | succeeded | canceled,
            // plus 'refunded' once we have refunded it.
            $table->string('status')->default('requires_payment_method');

            $table->timestamp('paid_at')->nullable();
            $table->timestamp('refunded_at')->nullable();
            $table->timestamps();

            $table->index(['payable_type', 'payable_id']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('payments');
    }
};
