<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Podcast;
use App\Services\DictionaryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class PodcastController extends Controller
{
    public function index()
    {
        // image_path is selected so the image_url accessor resolves on list
        // rows; user:id,name feeds the author line on the episode cards.
        return Podcast::query()
            ->with('user:id,name')
            ->latest()
            ->get(['id', 'title', 'level', 'bio', 'image_path', 'user_id', 'created_at']);
    }

    /**
     * Stream the episode audio through Laravel rather than the storage symlink.
     * `php artisan serve` (PHP's built-in server) ignores Range headers, so
     * media served straight off /storage cannot be seeked. BinaryFileResponse
     * advertises Accept-Ranges and answers with 206 Partial Content, which is
     * what the player's skip and scrub controls need.
     *
     * Public on purpose: the file is already reachable via /storage, so this
     * adds no exposure, and an <audio src> cannot send a bearer token.
     */
    public function audio(Podcast $podcast)
    {
        abort_unless($podcast->audio_path, 404);

        $path = Storage::disk('public')->path($podcast->audio_path);
        abort_unless(is_file($path), 404);

        return response()->file($path);
    }

    public function show(Podcast $podcast, DictionaryService $dictionary)
    {
        $podcast->load('user:id,name', 'cues');

        $payload = $podcast->toArray();

        /* Each cue is annotated on its own, exactly as study conversation lines
           are — so a word inside a timed line still gets its pinyin popover and
           its Alt+1 save. Annotated PER LINE rather than over the joined text
           because the segmenter would otherwise run words together across a
           line break and invent vocabulary that spans two sentences. */
        foreach ($payload['cues'] ?? [] as $i => $cue) {
            $payload['cues'][$i]['tokens'] = filled($cue['text'])
                ? $dictionary->annotate($cue['text'])
                : [];
        }

        return array_merge($payload, [
            /* Still sent, and still the whole transcript. An episode with no
               cues renders from this exactly as it did before syncing existed,
               and the admin editor edits this text rather than the lines. */
            'tokens' => $dictionary->annotate($podcast->transcript),
        ]);
    }

    /**
     * Replace an episode's timed lines wholesale.
     *
     * A whole-list replace rather than per-cue edits, the same shape the
     * tutor's weekly hours use: the client holds the entire transcript while
     * timing it, and sending one request per line would put the episode in a
     * half-timed state whenever one of them failed.
     *
     * Sending an empty array is how an episode is UNSYNCED — it drops back to
     * the plain transcript, which is a thing an author needs to be able to do
     * after re-recording the audio.
     */
    public function saveCues(Request $request, Podcast $podcast)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'cues' => ['present', 'array'],
            'cues.*.start_ms' => ['required', 'integer', 'min:0'],
            'cues.*.text' => ['required', 'string'],
        ]);

        DB::transaction(function () use ($podcast, $data) {
            $podcast->cues()->delete();

            foreach ($data['cues'] as $i => $cue) {
                $podcast->cues()->create([
                    'position' => $i + 1,
                    'start_ms' => $cue['start_ms'],
                    'text' => $cue['text'],
                ]);
            }
        });

        return response()->json($podcast->load('cues')->cues);
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'transcript' => ['required', 'string'],
            'transcript_en' => ['nullable', 'string'],
            'level' => ['nullable', 'string', 'in:Beginner,Intermediate,Advanced'],
            'bio' => ['nullable', 'string'],
            'audio' => ['required', 'file', 'mimes:mp3,wav,m4a,ogg,aac,flac,mp4', 'max:20480'],
            'image' => ['nullable', 'image', 'max:10240'],
        ]);

        $data['audio_path'] = $request->file('audio')->store('podcasts', 'public');
        unset($data['audio']);

        if ($request->hasFile('image')) {
            $data['image_path'] = $request->file('image')->store('podcasts', 'public');
        }
        unset($data['image']);

        $podcast = $request->user()->podcasts()->create($data);

        return response()->json($podcast, 201);
    }

    public function update(Request $request, Podcast $podcast)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'transcript' => ['required', 'string'],
            'transcript_en' => ['nullable', 'string'],
            'level' => ['nullable', 'string', 'in:Beginner,Intermediate,Advanced'],
            'bio' => ['nullable', 'string'],
            'audio' => ['nullable', 'file', 'mimes:mp3,wav,m4a,ogg,aac,flac,mp4', 'max:20480'],
            'image' => ['nullable', 'image', 'max:10240'],
        ]);

        if ($request->hasFile('audio')) {
            Storage::disk('public')->delete($podcast->audio_path);
            $data['audio_path'] = $request->file('audio')->store('podcasts', 'public');
        }
        unset($data['audio']);

        if ($request->hasFile('image')) {
            if ($podcast->image_path) {
                Storage::disk('public')->delete($podcast->image_path);
            }
            $data['image_path'] = $request->file('image')->store('podcasts', 'public');
        }
        unset($data['image']);

        $podcast->update($data);

        return response()->json($podcast);
    }

    public function destroy(Request $request, Podcast $podcast)
    {
        abort_unless($request->user()->is_admin, 403);

        Storage::disk('public')->delete($podcast->audio_path);
        if ($podcast->image_path) {
            Storage::disk('public')->delete($podcast->image_path);
        }
        $podcast->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
