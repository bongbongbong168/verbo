<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One recency list for everything a user opens, replacing the study-only
 * `study_progress` table.
 *
 * The Dashboard's "Pick up where you left off" row mixes study units and
 * podcasts and orders them by when they were last opened, so a per-module
 * progress table cannot answer it — "what did I touch most recently?" is one
 * question across modules, and two tables would have to be merged in PHP on
 * every dashboard load with no way to order them in SQL.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::create('recent_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('viewable_type');
            $table->unsignedBigInteger('viewable_id');
            $table->timestamp('last_viewed_at');
            $table->timestamps();

            // One row per user per thing — revisiting moves the timestamp
            // forward rather than stacking a second row, or a single unit
            // opened ten times would fill the whole three-tile row.
            $table->unique(['user_id', 'viewable_type', 'viewable_id']);
            // The only read is "newest N for this user".
            $table->index(['user_id', 'last_viewed_at']);
        });

        // Carry existing resume state over, so someone who has been working
        // through a level does not lose their place to this change.
        if (Schema::hasTable('study_progress')) {
            $now = now();

            DB::table('study_progress')->orderBy('id')->chunk(200, function ($rows) use ($now) {
                $insert = [];

                foreach ($rows as $row) {
                    $insert[] = [
                        'user_id' => $row->user_id,
                        'viewable_type' => \App\Models\StudyUnit::class,
                        'viewable_id' => $row->study_unit_id,
                        'last_viewed_at' => $row->last_viewed_at,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }

                if ($insert) {
                    DB::table('recent_views')->insert($insert);
                }
            });
        }

        // `study_progress` is deliberately NOT dropped here: the backfill above
        // is the only copy of that data, and leaving the table costs nothing.
        // Nothing reads or writes it any more — its model, controller and routes
        // are gone — so it can be dropped once this has been running a while.
    }

    public function down()
    {
        Schema::dropIfExists('recent_views');
    }
};
