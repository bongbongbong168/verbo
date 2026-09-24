<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Podcast;
use App\Services\ChineseTranslationService;
use App\Services\DeepgramTranscriptService;
use App\Services\TimedTranscriptBuilder;
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
        $podcast->markTimedTranscript('processing');
        try {
            $timed = $builder->build($deepgram->transcribe($podcast));
            $timed = $this->translateSegments($timed);
            $podcast->saveTimedTranscript($timed);
            $this->syncPlainTranscripts($podcast, $timed);

            return response()->json($this->show($request, $podcast->refresh()));
        } catch (\Throwable $e) {
            $podcast->markTimedTranscript('failed', $e->getMessage());

            return response()->json($this->show($request, $podcast->refresh()), 422);
        }
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

        $status = $podcast->timed_transcript_status ?? 'not_processed';
        $completed = $status === 'completed' && is_array($podcast->timed_transcript);

        /* Older JSON imports predate line-level English. Upgrade them when an
           admin opens the episode: five English paragraphs must never be
           guessed against forty timed Chinese lines. */
        if ($completed && $request->user()->is_admin && ! array_filter(array_column($podcast->timed_transcript['segments'] ?? [], 'translation'))) {
            $timed = $this->translateSegments($podcast->timed_transcript);
            if (array_filter(array_column($timed['segments'] ?? [], 'translation'))) {
                $podcast->saveTimedTranscript($timed);
                $this->syncPlainTranscripts($podcast, $timed);
                $podcast->refresh();
            }
        }

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

    /** Keep the manual Transcript tab in step with the generated lines. */
    private function syncPlainTranscripts(Podcast $podcast, array $timed): void
    {
        $segments = $timed['segments'] ?? [];
        $podcast->transcript = implode("\n", array_column($segments, 'text'));
        $podcast->transcript_en = implode("\n", array_filter(array_column($segments, 'translation')));
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
