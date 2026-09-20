<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Podcast;
use App\Services\TimedTranscriptBuilder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * The synced (word-timed) transcript of an episode.
 *
 * READ by every listener, WRITTEN only by an admin. Local development can
 * run the installed WhisperX engine directly; JSON remains a migration fallback.
 *
 * Routes follow the app's own convention - `is_admin` checked in the
 * controller, no /admin prefix - the same gate Read and Podcast use.
 */
class PodcastTranscriptController extends Controller
{
    private const MAX_UPLOAD_KB = 10240;

    /** Generate a timed transcript from this episode's uploaded audio. */
    public function generate(Request $request, Podcast $podcast)
    {
        abort_unless($request->user()->is_admin, 403);
        if (! $podcast->audio_path) {
            return response()->json(['message' => 'Upload an audio file before generating a synced transcript.'], 422);
        }
        if (! app()->environment('local')) {
            return response()->json(['message' => 'Automatic transcription is available from the local Verbo workspace.'], 409);
        }

        Artisan::call('podcast:transcribe', ['podcast' => $podcast->id]);

        $podcast->refresh();
        if ($podcast->timed_transcript_status === 'completed') {
            $timed = $this->translateSegments($podcast->timed_transcript);
            $podcast->saveTimedTranscript($timed);
            $chinese = implode("\n", array_column($timed['segments'] ?? [], 'text'));
            $podcast->transcript = $chinese;
            $podcast->transcript_en = implode("\n", array_filter(array_column($timed['segments'] ?? [], 'translation')));
            $podcast->save();
        }

        return $this->show($request, $podcast->refresh());
    }

    /** Translate each timed line together, preserving its Chinese/English pair. */
    private function translateSegments(array $transcript): array
    {
        $key = config('services.deepl.key');
        $segments = $transcript['segments'] ?? [];
        if (! $key || ! $segments) return $transcript;

        foreach (array_chunk($segments, 50) as $offset => $batch) {
            $texts = array_column($batch, 'text');
            try {
                $response = Http::withHeaders(['Authorization' => 'DeepL-Auth-Key '.$key])
                    ->connectTimeout(5)->timeout(30)->post('https://api-free.deepl.com/v2/translate', [
                        'text' => $texts, 'source_lang' => 'ZH', 'target_lang' => 'EN-US', 'split_sentences' => 'nonewlines',
                    ]);
                $translations = $response->json('translations', []);
                if (! $response->successful() || count($translations) !== count($batch)) continue;
                foreach ($translations as $i => $translation) {
                    $text = $translation['text'] ?? null;
                    if (is_string($text) && trim($text) !== '') $segments[$offset * 50 + $i]['translation'] = $text;
                }
            } catch (\Throwable $e) {
                // Keep timing usable if translation is temporarily unavailable.
            }
        }
        $transcript['segments'] = $segments;
        return $transcript;
    }

    public function show(Request $request, Podcast $podcast)
    {
        $status = $podcast->timed_transcript_status ?? 'not_processed';
        $completed = $status === 'completed' && is_array($podcast->timed_transcript);

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

    /**
     * Import a file written by tools/transcriber/process_podcast.py.
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
            return response()->json(['message' => 'Choose the .json file that process_podcast.py wrote.'], 422);
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
     * Correct lines by hand - what WhisperX misheard, or what should not be
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
