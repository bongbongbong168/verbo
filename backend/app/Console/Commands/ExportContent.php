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
    protected $signature = 'content:export
        {--out= : Directory to write to (default database/content)}
        {--skip-level-category=* : study_levels.category values to leave out, with everything beneath them}';

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

    /**
     * Each study table's parent: [foreign key on this table, table it points at].
     *
     * This is what lets an exclusion CASCADE. Leaving out a level has to leave
     * out its units, and their vocabulary, texts, lines, grammar, examples,
     * quiz questions and culture images with it — a row kept behind its missing
     * parent is a foreign key pointing at nothing, which the importer would
     * either reject or, worse, quietly attach to whatever now holds that id.
     *
     * Since TABLES is walked parents-first, each entry only has to know its own
     * parent; the ids that survived above are already resolved by the time a
     * child is reached.
     */
    public const PARENTS = [
        'study_units' => ['study_level_id', 'study_levels'],
        'study_vocabularies' => ['study_unit_id', 'study_units'],
        'study_texts' => ['study_unit_id', 'study_units'],
        'study_text_lines' => ['study_text_id', 'study_texts'],
        'study_grammar_points' => ['study_unit_id', 'study_units'],
        'study_grammar_examples' => ['study_grammar_point_id', 'study_grammar_points'],
        'study_quiz_questions' => ['study_unit_id', 'study_units'],
        'study_culture_images' => ['study_unit_id', 'study_units'],
    ];

    public function handle(): int
    {
        $out = $this->option('out') ?: database_path('content');
        $filesDir = $out.'/files';

        File::ensureDirectoryExists($filesDir);

        $skip = array_filter((array) $this->option('skip-level-category'));

        $payload = [
            'exported_at' => now()->toIso8601String(),
            // Recorded in the payload so a later reader can see what this
            // export deliberately leaves out, rather than wondering whether
            // the missing levels were a bug.
            'skipped_level_categories' => array_values($skip),
            'tables' => [],
        ];
        $files = [];

        // table => ids that survived, so each child can be narrowed to its
        // surviving parents as the walk goes down.
        $kept = [];

        foreach (self::TABLES as $table) {
            $query = DB::table($table)->orderBy('id');

            if ($table === 'study_levels' && $skip) {
                $query->where(function ($q) use ($skip) {
                    $q->whereNotIn('category', $skip)->orWhereNull('category');
                });
            }

            if (isset(self::PARENTS[$table])) {
                [$foreignKey, $parent] = self::PARENTS[$table];
                // Only when the parent was actually narrowed — an unfiltered
                // parent means nothing to carry down.
                if (array_key_exists($parent, $kept)) {
                    $query->whereIn($foreignKey, $kept[$parent] ?: [0]);
                }
            }

            $rows = $query->get()->map(fn ($r) => (array) $r)->all();

            if ($skip) {
                $kept[$table] = array_column($rows, 'id');
            }

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
