<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Copy every row from one database connection to another.
 *
 * Written for the SQLite -> Supabase Postgres move, but it is engine-agnostic:
 * it reads whatever `--from` holds and writes it into `--to`, which must
 * already have the schema (run `migrate` against the target first).
 *
 *   php artisan db:copy --from=sqlite --to=pgsql
 *
 * Deliberately NOT a `pg_dump`/`sqlite3 .dump` pipeline. Those emit dialect SQL
 * — SQLite writes `datetime` and `autoincrement`, which Postgres rejects — so a
 * dump would have to be hand-edited. Reading rows through the query builder and
 * re-inserting them lets each driver write its own dialect.
 */
class CopyDatabase extends Command
{
    protected $signature = 'db:copy
        {--from=sqlite : Source connection}
        {--to=pgsql : Destination connection}
        {--chunk=200 : Rows per insert batch}
        {--pretend : Report what would be copied without writing}';

    protected $description = 'Copy all table data from one database connection to another';

    /**
     * Parents before children, because the destination enforces foreign keys
     * where SQLite may not have. A child inserted before its parent fails, so
     * this order is the migration order in spirit rather than alphabetical.
     *
     * `migrations` is included so the target agrees about what has run;
     * `failed_jobs` and `password_resets` are operational scratch and are
     * skipped along with `personal_access_tokens` — see $skip.
     */
    private const ORDER = [
        'migrations',
        'users',
        'learning_preferences',
        'tutor_profiles',
        'tutor_lessons',
        'tutor_availability',
        'tutor_resume_entries',
        'tutor_reviews',
        'courses',
        'course_enrollments',
        'bookings',
        'payments',
        'conversations',
        'messages',
        'articles',
        'article_tags',
        'article_likes',
        'article_bookmarks',
        'article_comments',
        'article_shares',
        'article_views',
        'podcasts',
        'study_levels',
        'study_units',
        'study_vocabularies',
        'study_texts',
        'study_text_lines',
        'study_grammar_points',
        'study_grammar_examples',
        'study_quiz_questions',
        'study_culture_images',
        'classrooms',
        'classroom_members',
        'classroom_items',
        'classroom_item_files',
        'submissions',
        'submission_files',
        'scans',
        'flashcards',
        'recent_views',
        'activity_days',
        'notifications',
        'quotes',
    ];

    /**
     * Not copied.
     *
     * `personal_access_tokens` are session credentials — carrying them to a new
     * database would move live logins along with the data, and they cost
     * nothing to reissue. `study_progress` is the dead table the recent_views
     * migration replaced; it survives on disk only as a pre-migration copy.
     */
    private const SKIP = [
        'personal_access_tokens',
        'failed_jobs',
        'password_resets',
        'study_progress',
    ];

    public function handle(): int
    {
        $from = $this->option('from');
        $to = $this->option('to');
        $chunk = max(1, (int) $this->option('chunk'));
        $pretend = (bool) $this->option('pretend');

        if ($from === $to) {
            $this->error('--from and --to must differ.');

            return self::FAILURE;
        }

        $source = DB::connection($from);
        $target = DB::connection($to);

        try {
            $target->getPdo();
        } catch (\Throwable $e) {
            $this->error("Cannot reach the '{$to}' connection: ".$e->getMessage());

            return self::FAILURE;
        }

        $this->info(($pretend ? '[pretend] ' : '')."Copying {$from} -> {$to}");

        $total = 0;

        foreach (self::ORDER as $table) {
            if (in_array($table, self::SKIP, true)) {
                continue;
            }

            if (! Schema::connection($from)->hasTable($table)) {
                $this->line("  skip {$table} (not in source)");
                continue;
            }

            if (! Schema::connection($to)->hasTable($table)) {
                $this->warn("  MISSING in target: {$table} — run migrate on '{$to}' first");
                continue;
            }

            $count = $source->table($table)->count();
            if ($count === 0) {
                $this->line("  {$table}: empty");
                continue;
            }

            if ($pretend) {
                $this->line("  {$table}: would copy {$count}");
                $total += $count;
                continue;
            }

            // Emptied first so the command can be re-run after a failure
            // without stacking duplicates on top of a partial copy.
            $target->table($table)->delete();

            $copied = 0;
            $source->table($table)->orderBy('id')->chunk($chunk, function ($rows) use ($target, $table, &$copied) {
                $target->table($table)->insert(
                    $rows->map(fn ($r) => (array) $r)->all()
                );
                $copied += $rows->count();
            });

            $this->line("  {$table}: {$copied}");
            $total += $copied;
        }

        if (! $pretend && $target->getDriverName() === 'pgsql') {
            $this->resetSequences($target);
        }

        $this->info(($pretend ? 'Would copy ' : 'Copied ').$total.' rows.');

        return self::SUCCESS;
    }

    /**
     * Re-point every id sequence past the highest id just inserted.
     *
     * This is the step that is easy to forget and breaks everything afterwards:
     * Postgres tracks the next id in a SEQUENCE, and rows inserted with explicit
     * ids do not advance it. Without this the sequence still sits at 1, so the
     * very first row the app creates collides with existing data and throws a
     * duplicate-key error.
     */
    private function resetSequences($target): void
    {
        $this->info('Resetting Postgres id sequences...');

        foreach (self::ORDER as $table) {
            if (in_array($table, self::SKIP, true) || ! Schema::connection($target->getName())->hasTable($table)) {
                continue;
            }

            if (! Schema::connection($target->getName())->hasColumn($table, 'id')) {
                continue;
            }

            // pg_get_serial_sequence returns null for a table whose id is not
            // backed by a sequence, which setval would choke on.
            $target->statement("
                SELECT setval(
                    pg_get_serial_sequence('{$table}', 'id'),
                    COALESCE((SELECT MAX(id) FROM {$table}), 1),
                    (SELECT MAX(id) IS NOT NULL FROM {$table})
                )
                WHERE pg_get_serial_sequence('{$table}', 'id') IS NOT NULL
            ");
        }

        $this->line('  sequences aligned');
    }
}
