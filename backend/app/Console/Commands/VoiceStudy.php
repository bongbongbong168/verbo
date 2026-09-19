<?php

namespace App\Console\Commands;

use App\Models\StudyTextLine;
use App\Models\StudyVocabulary;
use App\Services\SpeechService;
use Illuminate\Console\Command;

/**
 * Make the Gemini audio for Study ahead of time, so the first learner to press
 * play hears it at once instead of waiting a few seconds for it to be made.
 *
 * Skips anything that already has a clip, so it is safe to re-run. It writes
 * to THIS machine's public disk: run it where the files should live. On
 * Railway that means inside the container (`railway ssh`), not `railway run`,
 * which executes locally - the same trap content:import documents.
 *
 * Paced with --delay because the free tier allows only a few requests a
 * minute; a refused request is reported and the run carries on.
 */
class VoiceStudy extends Command
{
    // 21s: Gemini's free tier allows 3 TTS requests a minute (measured: the
    // 429 names "limit: 3").
    protected $signature = 'study:voice {unit? : Only this study unit id} {--delay=21 : Seconds between requests}';

    protected $description = "Generate natural Mandarin audio for Study's words and conversation lines";

    public function handle(SpeechService $speech): int
    {
        if (! SpeechService::configured()) {
            $this->error('GEMINI_API_KEY is not set.');

            return self::FAILURE;
        }

        $unit = $this->argument('unit');
        $words = StudyVocabulary::query()->when($unit, fn ($q) => $q->where('study_unit_id', $unit))->pluck('hanzi');
        $lines = StudyTextLine::query()
            ->with('text.lines')
            ->when($unit, fn ($q) => $q->whereHas('text', fn ($t) => $t->where('study_unit_id', $unit)))
            ->get();

        // [kind, text, voice] - a line is read in its speaker's voice.
        $jobs = collect()
            ->merge($words->filter()->unique()->map(fn ($t) => ['word', $t, null]))
            ->merge($lines->filter(fn ($l) => filled($l->chinese))
                ->map(fn ($l) => ['line', $l->chinese, $l->text?->voiceFor($l->speaker)]))
            ->unique(fn ($j) => implode('|', $j))
            ->reject(fn ($j) => $speech->existingUrl($j[1], $j[0], $j[2]))
            ->values();

        if ($jobs->isEmpty()) {
            $this->info('Every word and line already has audio.');

            return self::SUCCESS;
        }

        $this->info("Making {$jobs->count()} clips...");
        $made = 0;
        foreach ($jobs as $i => [$kind, $text, $voice]) {
            if ($i > 0) {
                sleep((int) $this->option('delay'));
            }
            // Google asked us to wait: wait it out rather than burn a request.
            while (SpeechService::coolingDown()) {
                sleep(5);
            }
            $label = $voice ? "{$kind}/{$voice}" : $kind;
            if ($speech->urlFor($text, $kind, $voice)) {
                $made++;
                $this->line("  ok   {$label}  {$text}");
            } else {
                $this->warn("  fail {$label}  {$text} (see laravel.log; re-run later)");
            }
        }

        $this->info("Done: {$made} of {$jobs->count()} made.");

        return self::SUCCESS;
    }
}
