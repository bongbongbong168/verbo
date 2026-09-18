<?php

namespace App\Console\Commands;

use App\Models\Podcast;
use App\Services\TimedTranscriptBuilder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use Symfony\Component\Process\Process;

/**
 * Run WhisperX on an episode and save the synced transcript - on THIS machine.
 *
 *   php artisan podcast:transcribe 3            one episode
 *   php artisan podcast:transcribe --all        every episode with audio and no transcript yet
 *   php artisan podcast:transcribe 3 --file=x.json   import a file already made
 *
 * It exists for the local database, where the audio is on disk. Production
 * has no Python or GPU, so there the same JSON (kept in
 * storage/app/transcripts/) is uploaded from the episode's edit drawer.
 *
 * Status moves not_processed -> processing -> completed | failed, and a
 * failure stores a plain reason for the admin. The full WhisperX output is
 * printed here, never stored, because it carries paths and tracebacks.
 */
class TranscribePodcast extends Command
{
    protected $signature = 'podcast:transcribe
        {podcast? : The episode id}
        {--all : Every episode with audio whose transcript is not completed}
        {--file= : Import this JSON instead of running WhisperX}
        {--model= : Whisper model, default from TRANSCRIBER_MODEL}';

    protected $description = 'Transcribe a podcast with WhisperX and save its word-timed transcript';

    /* process_podcast.py's own exit codes, turned into what an admin reads. */
    private const EXIT_REASONS = [
        2 => 'The audio file could not be found.',
        3 => 'No Chinese speech was recognised in the audio.',
        4 => 'WhisperX could not align the transcript to the audio.',
    ];

    public function handle(TimedTranscriptBuilder $builder): int
    {
        if ($this->option('all')) {
            $episodes = Podcast::whereNotNull('audio_path')
                ->where(fn ($q) => $q->whereNull('timed_transcript_status')->orWhere('timed_transcript_status', '!=', 'completed'))
                ->orderBy('id')
                ->get();

            if ($episodes->isEmpty()) {
                $this->info('Every episode with audio already has a transcript.');

                return self::SUCCESS;
            }

            $failed = 0;
            foreach ($episodes as $podcast) {
                $failed += $this->process($podcast, $builder) ? 0 : 1;
            }

            return $failed ? self::FAILURE : self::SUCCESS;
        }

        $podcast = Podcast::find($this->argument('podcast'));
        if (! $podcast) {
            $this->error('Give an episode id, or --all.');

            return self::FAILURE;
        }

        return $this->process($podcast, $builder) ? self::SUCCESS : self::FAILURE;
    }

    private function process(Podcast $podcast, TimedTranscriptBuilder $builder): bool
    {
        $this->line("<info>#{$podcast->id}</info> {$podcast->title}");

        $json = $this->option('file') ?: $this->runWhisper($podcast);
        if ($json === null) {
            return false;
        }

        $raw = is_file($json) ? json_decode(file_get_contents($json), true) : null;
        if (! is_array($raw)) {
            return $this->recordFailure($podcast, 'The transcriber did not produce a readable transcript.');
        }

        try {
            $transcript = $builder->build($raw);
        } catch (InvalidArgumentException $e) {
            return $this->recordFailure($podcast, $e->getMessage());
        }

        $podcast->saveTimedTranscript($transcript);

        $stats = TimedTranscriptBuilder::stats($transcript);
        $this->info("  Saved: {$stats['segments']} segments, {$stats['timed_words']}/{$stats['words']} words timed.");
        $this->line("  File for production upload: {$json}");

        return true;
    }

    /** @return string|null the JSON path, or null after recording a failure */
    private function runWhisper(Podcast $podcast): ?string
    {
        if (! $podcast->audio_path || ! Storage::disk('public')->exists($podcast->audio_path)) {
            $this->recordFailure($podcast, 'This episode has no audio file to transcribe.');

            return null;
        }

        $python = config('services.transcriber.python');
        $script = config('services.transcriber.script');
        if (! is_file($python) || ! is_file($script)) {
            // Not stored as the episode's error: it is this machine's setup,
            // not something wrong with the episode.
            $this->error('  The transcriber is not installed. See tools/transcriber/README.md.');

            return null;
        }

        Storage::disk('local')->makeDirectory('transcripts');
        $out = Storage::disk('local')->path("transcripts/podcast-{$podcast->id}.json");

        $podcast->markTimedTranscript('processing');

        $process = new Process([
            $python,
            $script,
            Storage::disk('public')->path($podcast->audio_path),
            '-o', $out,
            '--model', $this->option('model') ?: config('services.transcriber.model'),
        ], null, ['PYTHONIOENCODING' => 'utf-8']);
        $process->setTimeout(null);

        // Stream WhisperX's own progress to the terminal as it happens.
        $process->run(fn ($type, $buffer) => $this->getOutput()->write('  '.$buffer));

        if (! $process->isSuccessful()) {
            $this->recordFailure(
                $podcast,
                self::EXIT_REASONS[$process->getExitCode()] ?? 'WhisperX failed. Run the command again to see its output.'
            );

            return null;
        }

        return $out;
    }

    private function recordFailure(Podcast $podcast, string $reason): bool
    {
        $podcast->markTimedTranscript('failed', $reason);
        $this->error('  Failed: '.$reason);

        return false;
    }
}
