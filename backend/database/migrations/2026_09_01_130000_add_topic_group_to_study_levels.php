<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which shelf a Daily Use topic sits on — Food & Restaurants, Travel, Work…
 *
 * A SECOND axis, not a replacement for `category`. `category` answers "is this
 * HSK or Daily Use?" and decides which tab the topic appears under; this
 * answers "what kind of situation is it?" and only groups the topics inside
 * Daily Use. Overloading the one column would have made a topic either
 * findable under Daily Use or filed under Travel, never both.
 *
 * Nullable and free-text against a whitelist in the model rather than an enum:
 * this machine's SQLite has no usable ALTER for changing an enum later, and the
 * list of everyday situations is exactly the sort of thing that grows. A topic
 * with none simply falls into "More topics" rather than disappearing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('study_levels', function (Blueprint $table) {
            $table->string('topic_group')->nullable()->after('category');
        });
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            throw new RuntimeException(
                'Rolling this back on SQLite needs a raw-SQL table rebuild; do it by hand.'
            );
        }

        Schema::table('study_levels', function (Blueprint $table) {
            $table->dropColumn('topic_group');
        });
    }
};
