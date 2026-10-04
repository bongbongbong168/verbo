<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Podcast;
use App\Services\ChineseTranslationService;
use App\Services\DeepgramTranscriptService;
use App\Services\TimedTranscriptBuilder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * The synced (word-timed) transcript of an episode.
 *
 * READ by every listener, WRITTEN only by an admin. Deepgram generates
 * Mandarin text and word timings; JSON remains a manual-import fallback.
 *
 * Routes follow the app's own convention - `is_admin` checked in the
 * controller, no /admin prefix - the same gate Read and Podcast use.
 */
class PodcastTranscriptController extends Controller
{
    private const MAX_UPLOAD_KB = 10240;

    public function __construct(private ChineseTranslationService $translator)
    {
    }

    /** Generate a timed transcript from this episode's uploaded audio. */
    public function generate(Request $request, Podcast $podcast, DeepgramTranscriptService $deepgram, TimedTranscriptBuilder $builder)
    {
        abort_unless($request->user()->is_admin, 403);
        if (! $podcast->audio_path) {
            return response()->json(['message' => 'Upload an audio file before generating a synced transcript.'], 422);
        }
        /* One run at a time. A second click while the first is working used
           to start a second paid transcription racing the first to write. */
        if ($this->isRunning($podcast)) {
            return response()->json(['message' => 'This transcript is already being generated. It will appear here when it is ready.'], 409);
        }
        $podcast->markTimedTranscript('processing');
        Cache::put(self::startedKey($podcast->id), now()->timestamp, now()->addDay());

        /* Deepgram may need up to two minutes for a long recording, and
           enriching the result can add more provider calls. Run it after
           Laravel has sent this response so Railway's HTTP gateway does not
           have to keep the request open. The editor already polls this
           endpoint while status is `processing`. This deliberately uses the
           application termination hook: production has no queue worker and
           QUEUE_CONNECTION=sync, so a regular queued job would run inline. */
        $podcastId = $podcast->id;
        app()->terminating(function () use ($podcastId, $deepgram, $builder) {
            /* This runs AFTER the response, still inside the admin's request.
               Keep going if they close the tab, and lift the 120s request
               limit for the transcription itself. */
            ignore_user_abort(true);
            @set_time_limit(600);

            $episode = Podcast::find($podcastId);
            if (! $episode) {
                return;
            }

            try {
                /* Chinese only. The English is the admin's to write, asked for
                   explicitly: generating no longer translates. */
                $timed = $builder->build($deepgram->transcribe($episode));
                $episode->saveTimedTranscript($timed);
                $this->syncPlainTranscripts($episode, $timed);
            } catch (\Throwable $e) {
                report($e);
                $episode->markTimedTranscript('failed', $e->getMessage());
            }
        });

        return response()->json($this->show($request, $podcast->refresh()), 202);
    }

    /** Translate each timed line together, preserving its Chinese/English pair. */
    private function translateSegments(array $transcript): array
    {
        $segments = $transcript['segments'] ?? [];
        if (! $segments) return $transcript;

        foreach (array_chunk($segments, 50) as $offset => $batch) {
            $texts = array_column($batch, 'text');
            try {
                $translations = $this->translator->translate($texts);
                foreach ($translations as $i => $text) $segments[$offset * 50 + $i]['translation'] = $text;
            } catch (\Throwable $e) {
                // Keep timing usable if translation is temporarily unavailable.
            }
        }
        $transcript['segments'] = $segments;
        return $transcript;
    }

    public function show(Request $request, Podcast $podcast)
    {
        abort_if(
            $podcast->is_premium && ! $request->user()->is_pro && ! $request->user()->is_admin,
            403,
            'Verbo Pro is required to read this transcript.'
        );

        /* A run that died without reporting back (the container restarted
           mid-job, a deploy, a crash) would read "Processing" for ever and
           the editor would poll it for ever. Past the limit it is a failure
           the admin can retry. */
        if (($podcast->timed_transcript_status ?? null) === 'processing' && ! $this->isRunning($podcast)) {
            $podcast->markTimedTranscript('failed', 'Generating took too long and was stopped. Please try again.');
        }

        $status = $podcast->timed_transcript_status ?? 'not_processed';
        $completed = $status === 'completed' && is_array($podcast->timed_transcript);

        /* No auto-translate on open any more: an admin opening an episode
           whose lines had no English used to machine-translate and overwrite
           the English box. The English is now left for the admin to write. */

        $body = [
            'podcast_id' => $podcast->id,
            'status' => $status,
            'processed_at' => $podcast->timed_transcript_at,
            'segments' => $completed ? ($podcast->timed_transcript['segments'] ?? []) : [],
        ];

        // Admin-only diagnostics. A listener has no use for them, and an error
        // message is the one field that could carry something internal.
        if ($request->user()->is_admin) {
            $body['error'] = $podcast->timed_transcript_error;
            $body['stats'] = $completed ? TimedTranscriptBuilder::stats($podcast->timed_transcript) : null;
            $body['model'] = $completed ? ($podcast->timed_transcript['model'] ?? null) : null;
        }

        return $body;
    }

    /** How long a run may take before it is treated as dead. */
    private const STALE_AFTER_MINUTES = 15;

    private static function startedKey(int $id): string
    {
        return "podcast-transcribe-started:{$id}";
    }

    /** True while a run is in flight and still inside its time allowance. */
    private function isRunning(Podcast $podcast): bool
    {
        if (($podcast->timed_transcript_status ?? null) !== 'processing') {
            return false;
        }
        $started = Cache::get(self::startedKey($podcast->id));

        return $started && now()->timestamp - (int) $started < self::STALE_AFTER_MINUTES * 60;
    }

    /** Keep the manual Transcript tab in step with the generated lines. */
    private function syncPlainTranscripts(Podcast $podcast, array $timed): void
    {
        $segments = $timed['segments'] ?? [];
        $podcast->transcript = implode("\n", array_column($segments, 'text'));
        // Only when the lines carry English - never blank the admin's own.
        $english = array_filter(array_column($segments, 'translation'));
        if ($english) $podcast->transcript_en = implode("\n", $english);
        $podcast->save();
    }

    /**
     * Import a compatible timed-transcript JSON file.
     *
     * A bad file is REFUSED and the episode keeps whatever it had: replacing a
     * working transcript with a failure because someone picked the wrong file
     * would be strictly worse than doing nothing.
     */
    public function store(Request $request, Podcast $podcast, TimedTranscriptBuilder $builder)
    {
        abort_unless($request->user()->is_admin, 403);

        $request->validate([
            'file' => ['required', 'file', 'max:'.self::MAX_UPLOAD_KB],
        ], [
            'file.max' => 'The transcript file must be under '.(self::MAX_UPLOAD_KB / 1024).'MB.',
        ]);

        /* By extension and by content, not by sniffed mimetype: fileinfo calls
           JSON "text/plain" or "application/json" depending on the machine,
           the same trap podcast audio hit. The decode below is the real check. */
        $file = $request->file('file');
        if (strtolower($file->getClientOriginalExtension()) !== 'json') {
            return response()->json(['message' => 'Choose a compatible timed-transcript .json file.'], 422);
        }

        $raw = json_decode(file_get_contents($file->getRealPath()), true);
        if (! is_array($raw)) {
            return response()->json(['message' => 'That file is not valid JSON.'], 422);
        }

        try {
            $transcript = $builder->build($raw);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $podcast->saveTimedTranscript($transcript);

        return $this->show($request, $podcast->refresh());
    }

    /**
     * Correct lines by hand - what the transcriber misheard, or what should not be
     * in the transcript at all. `lines` is [{index, text}]; an empty text
     * deletes the line. Indexes refer to the transcript as the admin loaded
     * it, so every edit is applied against that one snapshot.
     */
    public function update(Request $request, Podcast $podcast, TimedTranscriptBuilder $builder)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'lines' => ['required', 'array', 'max:5000'],
            'lines.*.index' => ['required', 'integer', 'min:0'],
            'lines.*.text' => ['nullable', 'string', 'max:2000'],
        ]);

        $transcript = $podcast->timed_transcript;
        if ($podcast->timed_transcript_status !== 'completed' || ! is_array($transcript)) {
            return response()->json(['message' => 'This episode has no synced transcript to edit.'], 409);
        }

        $edits = collect($data['lines'])->keyBy('index');
        $segments = [];
        foreach ($transcript['segments'] as $i => $line) {
            if (! $edits->has($i)) {
                $segments[] = $line;

                continue;
            }
            foreach ($builder->editLine($line, (string) ($edits[$i]['text'] ?? '')) as $rebuilt) {
                $segments[] = $rebuilt;
            }
        }

        if ($segments === []) {
            return response()->json(['message' => 'That would delete every line. Remove the synced transcript instead.'], 422);
        }

        $transcript['segments'] = $segments;
        $podcast->saveTimedTranscript($transcript);

        return $this->show($request, $podcast->refresh());
    }

    public function destroy(Request $request, Podcast $podcast)
    {
        abort_unless($request->user()->is_admin, 403);

        $podcast->clearTimedTranscript();

        return $this->show($request, $podcast->refresh());
    }
}
