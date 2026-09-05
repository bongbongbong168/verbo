<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Load a `content:export` payload into this environment.
 *
 * IDEMPOTENT BY ID. Rows are upserted on their primary key, so running it
 * twice changes nothing the second time and a re-run after editing the export
 * updates in place rather than duplicating the library. That is also why it is
 * NOT wired into the container entrypoint: running on every boot would stamp
 * over anything edited through the admin UI in production, which is a
 * different and much worse behaviour than "publish the library once".
 *
 * OWNERSHIP IS REMAPPED, NEVER CARRIED. The exported rows reference local user
 * ids that mean nothing here — id 2 is the author's admin account on a laptop
 * and could be anybody in production. Every `user_id` on a content row is
 * repointed at one resolved owner, so the import can never attach the library
 * to a stranger's account or to an id that does not exist.
 */
class ImportContent extends Command
{
    protected $signature = 'content:import
        {--in= : Directory to read from (default database/content)}
        {--owner= : Email of the account to own the imported content}
        {--pretend : Report what would change without writing anything}';

    protected $description = 'Import an exported content library (podcasts, articles, study curriculum)';

    public function handle(): int
    {
        $in = $this->option('in') ?: database_path('content');
        $manifest = $in.'/content.json';

        if (! File::exists($manifest)) {
            $this->error("No manifest at {$manifest}. Run content:export first.");

            return self::FAILURE;
        }

        $payload = json_decode(File::get($manifest), true);
        if (! is_array($payload) || ! isset($payload['tables'])) {
            $this->error('Manifest is not readable as a content export.');

            return self::FAILURE;
        }

        $owner = $this->resolveOwner();
        if (! $owner) {
            return self::FAILURE;
        }

        $this->info("Owner: {$owner->email} (id {$owner->id})");
        $this->line('Exported at: '.($payload['exported_at'] ?? 'unknown'));
        $this->newLine();

        if ($this->option('pretend')) {
            foreach (ExportContent::TABLES as $table) {
                $rows = $payload['tables'][$table] ?? [];
                $this->line(sprintf('  %-26s %d row(s) would be written', $table, count($rows)));
            }
            $this->newLine();
            $this->info('Pretend run — nothing was written.');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($payload, $owner) {
            foreach (ExportContent::TABLES as $table) {
                $rows = $payload['tables'][$table] ?? [];
                if (! $rows) {
                    $this->line(sprintf('  %-26s skipped (nothing exported)', $table));

                    continue;
                }

                // Only columns this environment actually has: an export taken
                // before a migration would otherwise fail the whole import on
                // a column that does not exist here yet.
                $known = Schema::getColumnListing($table);

                $prepared = array_map(function (array $row) use ($known, $owner) {
                    $row = array_intersect_key($row, array_flip($known));

                    if (array_key_exists('user_id', $row)) {
                        $row['user_id'] = $owner->id;
                    }

                    return $row;
                }, $rows);

                // Upsert on the primary key, updating every column but `id`.
                $columns = array_keys($prepared[0]);
                $update = array_values(array_diff($columns, ['id']));

                foreach (array_chunk($prepared, 200) as $chunk) {
                    DB::table($table)->upsert($chunk, ['id'], $update);
                }

                $this->line(sprintf('  %-26s %d row(s)', $table, count($prepared)));
            }

            $this->resetSequences();
        });

        $this->newLine();
        $this->copyFiles($in, $payload['files'] ?? []);

        $this->newLine();
        $this->info('Content imported.');

        return self::SUCCESS;
    }

    /**
     * The account the library is attached to: `--owner=email` when given,
     * otherwise the first admin.
     *
     * Deliberately never CREATES one. An account minted by a deploy script has
     * no password anybody set and no way to sign in, so it would be an
     * administrator nobody controls — the operator promotes a real registered
     * account instead.
     */
    private function resolveOwner(): ?User
    {
        $email = $this->option('owner');

        if ($email) {
            $user = User::where('email', $email)->first();
            if (! $user) {
                $this->error("No account with email {$email}. Register it first, then re-run.");

                return null;
            }

            return $user;
        }

        $admin = User::where('is_admin', true)->orderBy('id')->first();

        if (! $admin) {
            $this->error('No admin account here to own the content.');
            $this->line('Register an account on this environment, promote it with');
            $this->line("  User::where('email','...')->update(['is_admin' => true]);");
            $this->line('then re-run with --owner=that@email.');

            return null;
        }

        return $admin;
    }

    /**
     * Postgres does not move a table's identity sequence when a row is
     * inserted with an explicit id, so after this import the next ordinary
     * insert would reuse id 1 and collide. SQLite tracks the max itself and
     * needs nothing. Skipped silently on any other driver rather than guessed.
     */
    private function resetSequences(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        foreach (ExportContent::TABLES as $table) {
            DB::statement(
                "SELECT setval(pg_get_serial_sequence(?, 'id'), COALESCE((SELECT MAX(id) FROM {$table}), 1))",
                [$table]
            );
        }

        $this->line('  sequences reset for pgsql');
    }

    /**
     * Copy the exported uploads onto this environment's `public` disk, which in
     * production is a symlink onto the mounted volume — so they survive the
     * next deploy rather than living in a container that gets thrown away.
     */
    private function copyFiles(string $in, array $files): void
    {
        $copied = 0;
        $skipped = 0;
        $missing = 0;

        foreach ($files as $path) {
            $source = $in.'/files/'.$path;

            if (! File::exists($source)) {
                $missing++;

                continue;
            }

            // Never overwrite: a file already here is either this same import
            // run again or something uploaded since, and replacing the second
            // would silently undo it.
            if (Storage::disk('public')->exists($path)) {
                $skipped++;

                continue;
            }

            Storage::disk('public')->put($path, File::get($source));
            $copied++;
        }

        $this->info("Files: {$copied} copied, {$skipped} already present, {$missing} missing from the payload");
    }
}
