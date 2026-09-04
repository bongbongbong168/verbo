<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Podcast;
use App\Services\DictionaryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class PodcastController extends Controller
{
    public function index()
    {
        /* image_path is selected so the image_url accessor resolves on list
           rows; user:id,name feeds the author line on the episode cards.
           `category` rides along so the page can shelve by topic, and
           `audio_path` so a card can say an episode has no recording yet —
           the raw column rather than audio_url, which would build a streaming
           URL for a file that is not there. */
        return Podcast::query()
            ->with('user:id,name')
            ->latest()
            ->get(['id', 'title', 'level', 'category', 'bio', 'host', 'image_path', 'audio_path', 'user_id', 'created_at']);
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
        $podcast->load('user:id,name');

        return array_merge($podcast->toArray(), [
            'tokens' => $dictionary->annotate($podcast->transcript),
        ]);
    }

    /**
     * How large an episode may be, in kilobytes.
     *
     * 20480 (20MB) was the old value and it was too small to be usable: a
     * twenty-minute episode at 128kbps is already ~19MB, so most real uploads
     * were rejected. 61440 (60MB) covers about an hour at that bitrate.
     *
     * Keep this BELOW php's upload_max_filesize (64M, set in the Dockerfile) —
     * a file that clears this rule but not php's never reaches validation at
     * all: php discards the body and Laravel sees an empty request, so the
     * error it reports is "the title field is required" for what is really a
     * file size problem. `guardPostSize` below is what catches that case.
     */
    private const AUDIO_MAX_KB = 61440;

    private const AUDIO_MIMES = 'mp3,wav,m4a,ogg,aac,flac,mp4';

    public function store(Request $request)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'transcript' => ['required', 'string'],
            'transcript_en' => ['nullable', 'string'],
            'level' => ['nullable', 'string', 'in:Beginner,Intermediate,Advanced'],
            'category' => ['nullable', 'string', Rule::in(Podcast::CATEGORIES)],
            'bio' => ['nullable', 'string'],
            'host' => ['nullable', 'string', 'max:120'],
            /* Nullable, not required: an episode can be written before it is
               recorded. The column allows it now, the episode page already
               renders "No audio uploaded for this episode" rather than an
               empty player, and forcing a file here meant a transcript could
               not be drafted at all without one. */
            'audio' => ['nullable', 'file', 'mimes:'.self::AUDIO_MIMES, 'max:'.self::AUDIO_MAX_KB],
            'image' => ['nullable', 'image', 'max:10240'],
        ], [
            // The default reads "must not be greater than 61440 kilobytes",
            // which nobody can convert at a glance.
            'audio.max' => 'The audio file must be under '.(self::AUDIO_MAX_KB / 1024).'MB.',
            'audio.mimes' => 'The audio must be one of: '.str_replace(',', ', ', self::AUDIO_MIMES).'.',
        ]);

        if ($request->hasFile('audio')) {
            $data['audio_path'] = $request->file('audio')->store('podcasts', 'public');
        }
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
            'category' => ['nullable', 'string', Rule::in(Podcast::CATEGORIES)],
            'bio' => ['nullable', 'string'],
            'host' => ['nullable', 'string', 'max:120'],
            'audio' => ['nullable', 'file', 'mimes:'.self::AUDIO_MIMES, 'max:'.self::AUDIO_MAX_KB],
            'image' => ['nullable', 'image', 'max:10240'],
        ], [
            'audio.max' => 'The audio file must be under '.(self::AUDIO_MAX_KB / 1024).'MB.',
            'audio.mimes' => 'The audio must be one of: '.str_replace(',', ', ', self::AUDIO_MIMES).'.',
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
