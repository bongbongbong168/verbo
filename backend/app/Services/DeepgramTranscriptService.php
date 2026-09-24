<?php

namespace App\Services;

use App\Models\Podcast;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/** Turns Deepgram's Mandarin response into Verbo's timed-transcript format. */
class DeepgramTranscriptService
{
    public function transcribe(Podcast $podcast): array
    {
        $key = config('services.deepgram.key');
        if (! is_string($key) || trim($key) === '') {
            throw new RuntimeException('Add DEEPGRAM_API_KEY before generating a transcript.');
        }
        $disk = Storage::disk($podcast->audioDisk());
        if (! $podcast->audio_path || ! $disk->exists($podcast->audio_path)) {
            throw new RuntimeException('This episode has no audio file to transcribe.');
        }

        $path = $disk->path($podcast->audio_path);
        $audio = @file_get_contents($path);
        if ($audio === false) {
            throw new RuntimeException('Verbo could not read this episode audio.');
        }

        $query = http_build_query([
            'model' => config('services.deepgram.model', 'nova-3'),
            'language' => 'zh',
            'smart_format' => 'true',
            'punctuate' => 'true',
            'paragraphs' => 'true',
            // Chinese narration often has no punctuation in its written
            // response. Utterances split it at natural speech pauses, which
            // gives the player short lines even in that case.
            'utterances' => 'true',
        ]);
        try {
            $response = Http::withToken($key, 'Token')->acceptJson()
                ->withBody($audio, mime_content_type($path) ?: 'audio/mpeg')
                ->connectTimeout(10)->timeout((int) config('services.deepgram.timeout', 120))
                ->post('https://api.deepgram.com/v1/listen?'.$query);
        } catch (\Throwable $e) {
            throw new RuntimeException('Deepgram could not be reached. Please try again.');
        }
        if (! $response->successful()) {
            report(new RuntimeException('Deepgram transcription failed: HTTP '.$response->status().' '.$response->body()));
            throw new RuntimeException('Deepgram could not transcribe this audio. Please try again.');
        }

        $alternative = data_get($response->json(), 'results.channels.0.alternatives.0');
        $words = is_array($alternative['words'] ?? null) ? $alternative['words'] : [];
        if ($words === []) {
            throw new RuntimeException('Deepgram did not find Chinese speech in this audio.');
        }

        $utterances = data_get($response->json(), 'results.utterances');
        $groups = is_array($utterances) && $utterances !== [] ? $utterances : [[
            'words' => $words,
            'start' => $words[0]['start'] ?? null,
            'end' => $words[count($words) - 1]['end'] ?? null,
        ]];
        $segments = [];
        foreach ($groups as $group) {
            if (! is_array($group)) continue;
            $segment = $this->segment($group['words'] ?? [], $group['start'] ?? null, $group['end'] ?? null);
            if ($segment !== null) $segments[] = $segment;
        }
        if ($segments === []) {
            throw new RuntimeException('Deepgram returned an empty Chinese transcript.');
        }

        return [
            'version' => TimedTranscriptBuilder::FORMAT_VERSION,
            'language' => 'zh',
            'model' => 'deepgram/'.config('services.deepgram.model', 'nova-3'),
            'duration' => data_get($response->json(), 'metadata.duration'),
            'segments' => $segments,
        ];
    }

    private function segment(array $words, mixed $segmentStart, mixed $segmentEnd): ?array
    {
        $chars = [];
        $text = '';
        foreach ($words as $word) {
            if (! is_array($word)) continue;
            $written = trim((string) ($word['punctuated_word'] ?? $word['word'] ?? ''));
            if ($written === '') continue;
            $start = $this->time($word['start'] ?? null);
            $end = $this->time($word['end'] ?? null);
            $letters = mb_str_split($written);
            foreach ($letters as $index => $letter) {
                $count = count($letters);
                $at = $start !== null && $end !== null ? $start + (($end - $start) * $index / $count) : $start;
                $until = $start !== null && $end !== null ? $start + (($end - $start) * ($index + 1) / $count) : $end;
                $chars[] = [
                    'char' => $letter,
                    'start' => $at === null ? null : round($at, 3),
                    'end' => $until === null ? null : round(max($until, $at ?? $until), 3),
                    'score' => is_numeric($word['confidence'] ?? null) ? (float) $word['confidence'] : null,
                ];
                $text .= $letter;
            }
        }
        if ($text === '') {
            return null;
        }

        return [
            'start' => $this->time($segmentStart) ?? ($chars[0]['start'] ?? null),
            'end' => $this->time($segmentEnd) ?? ($chars[count($chars) - 1]['end'] ?? null),
            'text' => $text,
            'chars' => $chars,
        ];
    }

    private function time(mixed $value): ?float
    {
        return is_numeric($value) && (float) $value >= 0 ? (float) $value : null;
    }
}
