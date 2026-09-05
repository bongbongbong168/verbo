<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

/**
 * Package the admin-authored library — podcasts, articles and the study
 * curriculum, with their images — so it can be carried to another environment.
 *
 * WHY THIS EXISTS. All of this content was authored against the local SQLite
 * database. Production has the same schema and no rows, so the deployed site is
 * an empty shell: every shelf, every level, every episode is missing. Copying
 * the database wholesale is not the answer, because that file also holds real
 * accounts, tokens, private scans, bookings and chat.
 *
 * WHAT IS DELIBERATELY NOT EXPORTED. Anything belonging to a PERSON:
 * users, personal_access_tokens, flashcards, scans, bookings, messages,
 * conversations, notifications, recent_views, payments, course_enrollments,
 * classrooms, learning_preferences. A scan is a private upload and a booking is
 * an agreement between two people; neither is library content, and shipping
 * them to a public server would be a disclosure, not a migration.
 *
 * Tutors are also left out. Their profiles hang off seeded user accounts with
 * no usable password, so publishing them means publishing invented people —
 * that is a product decision rather than a content move, and it is not made
 * here.
 */
class ExportContent extends Command
{
    protected $signature = 'content:export {--out= : Directory to write to (default database/content)}';

    protected $description = 'Export the admin-authored library and its images for import elsewhere';

    /**
     * Content tables in DEPENDENCY ORDER — parents first. The importer walks
     * this same list forwards, so a child can never be written before the row
     * it points at exists.
     */
    public const TABLES = [
        'quotes',
        'articles',
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
    ];

    /**
     * Columns holding a path on the `public` disk. The files they name are
     * copied alongside the rows — a row pointing at an image that was left
     * behind renders a broken cover, which is worse than no cover at all.
     */
    public const FILE_COLUMNS = [
        'articles' => ['image_path'],
        'podcasts' => ['audio_path', 'image_path'],
        'study_levels' => ['image_path', 'banner_path'],
        'study_culture_images' => ['path'],
    ];

    public function handle(): int
    {
        $out = $this->option('out') ?: database_path('content');
        $filesDir = $out.'/files';

        File::ensureDirectoryExists($filesDir);

        $payload = ['exported_at' => now()->toIso8601String(), 'tables' => []];
        $files = [];

        foreach (self::TABLES as $table) {
            $rows = DB::table($table)->orderBy('id')->get()
                ->map(fn ($r) => (array) $r)
                ->all();

            $payload['tables'][$table] = $rows;
            $this->line(sprintf('  %-26s %d', $table, count($rows)));

            foreach (self::FILE_COLUMNS[$table] ?? [] as $column) {
                foreach ($rows as $row) {
                    $path = $row[$column] ?? null;
                    if ($path) {
                        $files[] = $path;
                    }
                }
            }
        }

        $files = array_values(array_unique($files));
        $payload['files'] = $files;

        $copied = 0;
        $missing = [];

        foreach ($files as $path) {
            if (! Storage::disk('public')->exists($path)) {
                // Recorded rather than fatal: a row whose upload was deleted
                // off disk is still worth carrying, and the import says which
                // ones arrived without their file.
                $missing[] = $path;
                continue;
            }

            $target = $filesDir.'/'.$path;
            File::ensureDirectoryExists(dirname($target));
            File::put($target, Storage::disk('public')->get($path));
            $copied++;
        }

        File::put($out.'/content.json', json_encode(
            $payload,
            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ));

        $this->newLine();
        $this->info("Wrote {$out}/content.json");
        $this->info("Copied {$copied} of ".count($files).' files');

        if ($missing) {
            $this->warn('Missing on disk (rows exported without them):');
            foreach ($missing as $path) {
                $this->warn('  '.$path);
            }
        }

        return self::SUCCESS;
    }
}
