<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The grammar design (design/study/grammar.png) needs two things the original
 * table could not express: a prose `description` paragraph above the structure,
 * and examples as Chinese / pinyin / English rows rather than one text blob.
 *
 * Dropping the legacy `examples` column takes two different routes, because the
 * table rebuild below is a SQLITE WORKAROUND, not the natural way to do this:
 * this machine runs SQLite 3.33 (native ALTER TABLE DROP COLUMN landed in 3.35)
 * and doctrine/dbal — which Laravel's dropColumn needs on SQLite — is not
 * installed. Legacy text is carried over first either way, so no authored
 * content is lost.
 *
 * Every other engine, Postgres included, can simply alter the table. The raw
 * DDL is SQLite-only dialect (`autoincrement`, `datetime`) and fails outright on
 * Postgres, so keeping it unconditional would have made this the one migration
 * blocking a move to Supabase.
 */
return new class extends Migration
{
    public function up()
    {
        // 1. Read the legacy blobs out before the column disappears.
        $legacy = DB::table('study_grammar_points')
            ->whereNotNull('examples')
            ->where('examples', '<>', '')
            ->pluck('examples', 'id');

        // 2. study_grammar_points: + description, - examples.
        if (DB::getDriverName() === 'sqlite') {
            DB::statement('CREATE TABLE study_grammar_points_new (
                id integer not null primary key autoincrement,
                study_unit_id integer not null,
                title varchar not null,
                description text null,
                structure text null,
                created_at datetime null,
                updated_at datetime null
            )');
            DB::statement('INSERT INTO study_grammar_points_new
                (id, study_unit_id, title, structure, created_at, updated_at)
                SELECT id, study_unit_id, title, structure, created_at, updated_at
                FROM study_grammar_points');
            DB::statement('DROP TABLE study_grammar_points');
            DB::statement('ALTER TABLE study_grammar_points_new RENAME TO study_grammar_points');
        } else {
            Schema::table('study_grammar_points', function (Blueprint $table) {
                $table->text('description')->nullable()->after('title');
            });
            Schema::table('study_grammar_points', function (Blueprint $table) {
                $table->dropColumn('examples');
            });
        }

        // 3. Structured examples, one row per sentence.
        Schema::create('study_grammar_examples', function (Blueprint $table) {
            $table->id();
            $table->foreignId('study_grammar_point_id')->constrained()->cascadeOnDelete();
            $table->text('chinese');
            $table->text('pinyin')->nullable();
            $table->text('english')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });

        // 4. Replay the legacy text — one example per non-empty line. Pinyin is
        //    left null here; the controller fills it on the next edit, and this
        //    migration should not depend on the CEDICT index being present.
        $now = now();
        foreach ($legacy as $pointId => $text) {
            $position = 0;
            foreach (preg_split('/\R/', $text) as $line) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }

                DB::table('study_grammar_examples')->insert([
                    'study_grammar_point_id' => $pointId,
                    'chinese' => $line,
                    'position' => $position++,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down()
    {
        $blobs = DB::table('study_grammar_examples')
            ->orderBy('position')
            ->get()
            ->groupBy('study_grammar_point_id')
            ->map(fn ($rows) => $rows->pluck('chinese')->implode("\n"));

        Schema::dropIfExists('study_grammar_examples');

        // Same split as `up()` — the rebuild is the SQLite workaround, not the
        // default path.
        if (DB::getDriverName() === 'sqlite') {
            DB::statement('CREATE TABLE study_grammar_points_old (
                id integer not null primary key autoincrement,
                study_unit_id integer not null,
                title varchar not null,
                structure text null,
                examples text null,
                created_at datetime null,
                updated_at datetime null
            )');
            DB::statement('INSERT INTO study_grammar_points_old
                (id, study_unit_id, title, structure, created_at, updated_at)
                SELECT id, study_unit_id, title, structure, created_at, updated_at
                FROM study_grammar_points');
            DB::statement('DROP TABLE study_grammar_points');
            DB::statement('ALTER TABLE study_grammar_points_old RENAME TO study_grammar_points');
        } else {
            Schema::table('study_grammar_points', function (Blueprint $table) {
                $table->text('examples')->nullable();
            });
            Schema::table('study_grammar_points', function (Blueprint $table) {
                $table->dropColumn('description');
            });
        }

        foreach ($blobs as $pointId => $text) {
            DB::table('study_grammar_points')->where('id', $pointId)->update(['examples' => $text]);
        }
    }
};
