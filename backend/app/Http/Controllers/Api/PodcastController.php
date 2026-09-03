<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Podcast;
use App\Services\DictionaryService;
use Illuminate\Http\Request;
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
        $podcast->load('user:id,name');

        return array_merge($podcast->toArray(), [
            'tokens' => $dictionary->annotate($podcast->transcript),
        ]);
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
