<?php

namespace App\Console\Commands;

use App\Models\StudyTextLine;
use App\Models\StudyVocabulary;
use App\Services\SpeechService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

/**
 * Ship Study's audio clips with the code instead of making them twice.
 *
 * The free Gemini tier allows 10 TTS requests a DAY, shared by every install
 * that uses the key. So clips are made once, on the dev machine, and carried
 * to production inside the deploy:
 *
 *   php artisan speech:bundle            copy the local clips into resources/speech (commit them)
 *   php artisan speech:bundle --install  copy bundled clips onto this machine's public disk
 *
 * The entrypoint runs --install on every boot. A clip's file name is a hash of
 * model, voice, style and text, so a clip made locally is exactly the one the
 * live site looks up. Both directions only ever ADD missing files, so neither
 * can overwrite or delete anything.
 */
class SpeechBundle extends Command
{
    protected $signature = 'speech:bundle {--install : Copy bundled clips onto the public disk}';

    protected $description = "Bundle Study's audio clips with the code, or install bundled clips";

    public function handle(SpeechService $speech): int
    {
        $bundle = resource_path('speech');
        $disk = Storage::disk('public');
        File::ensureDirectoryExists($bundle);

        $copied = 0;
        if ($this->option('install')) {
            foreach (File::files($bundle) as $file) {
                $target = 'speech/'.$file->getFilename();
                if ($file->getExtension() === 'wav' && ! $disk->exists($target)) {
                    $disk->put($target, File::get($file->getPathname()));
                    $copied++;
                }
            }
            $this->info("Installed {$copied} bundled clips.");

            return self::SUCCESS;
        }

        /* Only clips the current lessons actually use: an edited line or a
           changed voice leaves its old clip on disk, and there is no point
           shipping audio nothing will ever ask for. */
        $wanted = collect()
            ->merge(StudyVocabulary::pluck('hanzi')->filter()->map(fn ($t) => $speech->path($t, 'word')))
            ->merge(StudyTextLine::with('text.lines')->get()
                ->filter(fn ($l) => filled($l->chinese))
                ->map(fn ($l) => $speech->path($l->chinese, 'line', $l->text?->voiceFor($l->speaker))))
            ->flip();

        foreach ($disk->files('speech') as $path) {
            $target = $bundle.'/'.basename($path);
            if (isset($wanted[$path]) && ! File::exists($target)) {
                File::put($target, $disk->get($path));
                $copied++;
            }
        }
        $this->info("Bundled {$copied} new clips into resources/speech. Commit them, then deploy.");

        return self::SUCCESS;
    }
}
