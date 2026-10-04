<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per ABA PayWay checkout. Its own table rather than more columns on
 * `payments`, whose Stripe intent id is unique and required - a PayWay row
 * has no intent, and loosening that column on SQLite means a table rebuild
 * under the working Stripe path.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payway_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Booking | CourseEnrollment, whitelisted in PaymentService::PAYABLES.
            $table->string('payable_type');
            $table->unsignedBigInteger('payable_id');
            // Our id for the transaction at ABA. PayWay caps it at 20 chars.
            $table->string('tran_id', 20)->unique();
            // Cents, like `payments` - never a float for money.
            $table->unsignedInteger('amount');
            $table->string('currency', 3)->default('USD');
            // pending | paid | failed
            $table->string('status')->default('pending');
            $table->string('apv')->nullable(); // ABA's approval code
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['payable_type', 'payable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payway_transactions');
    }
};
