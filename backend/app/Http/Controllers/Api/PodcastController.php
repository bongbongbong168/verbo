<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Podcast;
use App\Models\PodcastListenDay;
use App\Models\PodcastProgress;
use App\Models\SavedItem;
use App\Services\DictionaryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;

class PodcastController extends Controller
{
    public function index(Request $request)
    {
        /* image_path is selected so the image_url accessor resolves on list
           rows; user:id,name feeds the author line on the episode cards.
           `category` rides along so the page can shelve by topic, and
           `audio_path` so a card can say an episode has no recording yet —
           the raw column rather than audio_url, which would build a streaming
           URL for a file that is not there. */
        $saved = SavedItem::where('user_id', $request->user()->id)->where('kind', 'podcast')->pluck('item_id')->all();

        return Podcast::query()
            ->with('user:id,name')
            ->latest()
            ->get(['id', 'title', 'level', 'category', 'is_premium', 'bio', 'host', 'image_path', 'audio_path', 'user_id', 'created_at'])
            ->each(function (Podcast $podcast) use ($request, $saved) {
                $podcast->setAttribute('saved', in_array($podcast->id, $saved));
                $podcast->setAttribute('premium_locked', $this->premiumLocked($request, $podcast));
                $podcast->setAttribute('has_audio', (bool) $podcast->audio_path);
            });
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
    public function audio(Request $request, Podcast $podcast)
    {
        abort_unless($podcast->audio_path, 404);
        abort_if($podcast->is_premium && ! $request->hasValidSignature(), 403);

        $path = Storage::disk($podcast->audioDisk())->path($podcast->audio_path);
        abort_unless(is_file($path), 404);

        return response()->file($path);
    }

    public function show(Request $request, Podcast $podcast, DictionaryService $dictionary)
    {
        $podcast->load('user:id,name');
        $locked = $this->premiumLocked($request, $podcast);

        /* The viewer's own place in this episode, so the player can pick up
           where they stopped without a second request before it can start. */
        $progress = PodcastProgress::where('user_id', $request->user()->id)
            ->where('podcast_id', $podcast->id)
            ->first();

        $payload = $podcast->toArray();
        $payload['premium_locked'] = $locked;
        $payload['has_audio'] = (bool) $podcast->audio_path;
        $payload['audio_url'] = $locked
            ? null
            : ($podcast->is_premium && $podcast->audio_path
                ? URL::temporarySignedRoute('podcasts.audio', now()->addMinutes(30), ['podcast' => $podcast->id])
                : $podcast->audio_url);
        $payload['transcript'] = $locked ? null : $podcast->transcript;
        $payload['transcript_en'] = $locked ? null : $podcast->transcript_en;

        return array_merge($payload, [
            'tokens' => ! $locked && $podcast->transcript ? $dictionary->annotate($podcast->transcript) : [],
            'progress' => ! $locked && $progress ? [
                'position_seconds' => $progress->position_seconds,
                'duration_seconds' => $progress->duration_seconds,
                'completed_at' => $progress->completed_at,
                // Whether to actually seek. The client should not have to know
                // the floor or the completion rule — see the model.
                'resume' => $progress->is_resumable,
            ] : null,
        ]);
    }

    /**
     * Record how far through an episode this listener is.
     *
     * Called on a timer while the audio plays, plus on pause and on leaving the
     * page, so it has to be cheap and total-order-independent — it is an upsert
     * of one row, never a log.
     */
    public function saveProgress(Request $request, Podcast $podcast)
    {
        abort_if($this->premiumLocked($request, $podcast), 403, 'Verbo Pro is required to play this episode.');

        $data = $request->validate([
            'position_seconds' => ['required', 'integer', 'min:0'],
            'duration_seconds' => ['nullable', 'integer', 'min:0'],
        ]);

        $duration = $data['duration_seconds'] ?? null;
        $position = $data['position_seconds'];

        /* Both numbers come from the browser and neither is trustworthy. They
           only ever drive a display and a seek, so the risk is nonsense rather
           than danger — but a position past the end would strand the row
           outside the completion window and keep the episode in "continue
           listening" for good, so clamp it. */
        if ($duration !== null && $duration > 0) {
            $position = min($position, $duration);
        }

        $finished = $duration !== null
            && $duration > 0
            && $position >= $duration - PodcastProgress::FINISHED_WITHIN_SECONDS;

        /* Credit the FORWARD gap since the last report as time listened.
           `position_seconds` alone cannot answer "how long did you listen?" -
           seeking to 4:00 would read 240 without a second heard - so the
           daily figure is measured here, server-side, and clamped per report
           (PodcastListenDay::MAX_CREDIT_SECONDS). A seek backwards or a jump
           forwards credits nothing. */
        $before = PodcastProgress::where('user_id', $request->user()->id)
            ->where('podcast_id', $podcast->id)
            ->value('position_seconds');
        PodcastListenDay::credit($request->user()->id, $position - (int) $before);

        $progress = PodcastProgress::updateOrCreate(
            ['user_id' => $request->user()->id, 'podcast_id' => $podcast->id],
            [
                'position_seconds' => $position,
                'duration_seconds' => $duration,
                /* Finishing is sticky within a run but not permanent: replaying
                   from the start clears it, so a re-listen behaves like a fresh
                   one rather than an episode that can never re-enter the row. */
                'completed_at' => $finished ? now() : null,
            ]
        );

        return [
            'position_seconds' => $progress->position_seconds,
            'completed_at' => $progress->completed_at,
        ];
    }

    /**
     * Episodes this listener started and has not finished, newest first.
     *
     * Its route MUST be declared before `/podcasts/{podcast}` or "continue"
     * binds as an id — the same trap `bookings/clear-past`, `notifications/
     * read-all`, `articles/recommended` and `classes/join` all hit.
     */
    public function continueListening(Request $request)
    {
        $limit = min(max((int) $request->query('limit', 3), 1), 12);

        $rows = PodcastProgress::where('user_id', $request->user()->id)
            ->whereNull('completed_at')
            ->where('position_seconds', '>=', PodcastProgress::RESUME_FLOOR_SECONDS)
            ->latest('updated_at')
            // Over-fetch so rows whose episode has since been deleted can be
            // dropped without leaving a short list.
            ->limit($limit * 2)
            ->with('podcast.user:id,name')
            ->get();

        return $rows
            ->filter(fn (PodcastProgress $p) => $p->podcast !== null)
            ->take($limit)
            ->values()
            ->map(fn (PodcastProgress $p) => [
                'podcast' => array_merge(
                    $p->podcast->only([
                        'id', 'title', 'level', 'category', 'bio', 'host', 'created_at',
                        'is_premium',
                    ]),
                    [
                        'image_url' => $p->podcast->image_url,
                        'author' => $p->podcast->user?->name,
                        'premium_locked' => $this->premiumLocked($request, $p->podcast),
                    ]
                ),
                'position_seconds' => $p->position_seconds,
                'duration_seconds' => $p->duration_seconds,
                'last_played_at' => $p->updated_at,
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
            'transcript' => ['nullable', 'string'],
            'transcript_en' => ['nullable', 'string'],
            'level' => ['nullable', 'string', 'in:Beginner,Intermediate,Advanced'],
            'category' => ['nullable', 'string', Rule::in(Podcast::CATEGORIES)],
            'is_premium' => ['sometimes', 'boolean'],
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
            $disk = ! empty($data['is_premium']) ? 'local' : 'public';
            $data['audio_path'] = $request->file('audio')->store('podcasts', $disk);
        }
        unset($data['audio']);

        if ($request->hasFile('image')) {
            $data['image_path'] = $request->file('image')->store('podcasts', 'public');
        }
        unset($data['image']);

        $podcast = $request->user()->podcasts()->create(array_merge($data, ['transcript' => $data['transcript'] ?? '']));

        return response()->json($podcast, 201);
    }

    public function update(Request $request, Podcast $podcast)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'transcript' => ['nullable', 'string'],
            'transcript_en' => ['nullable', 'string'],
            'level' => ['nullable', 'string', 'in:Beginner,Intermediate,Advanced'],
            'category' => ['nullable', 'string', Rule::in(Podcast::CATEGORIES)],
            'is_premium' => ['sometimes', 'boolean'],
            'bio' => ['nullable', 'string'],
            'host' => ['nullable', 'string', 'max:120'],
            'audio' => ['nullable', 'file', 'mimes:'.self::AUDIO_MIMES, 'max:'.self::AUDIO_MAX_KB],
            'image' => ['nullable', 'image', 'max:10240'],
        ], [
            'audio.max' => 'The audio file must be under '.(self::AUDIO_MAX_KB / 1024).'MB.',
            'audio.mimes' => 'The audio must be one of: '.str_replace(',', ', ', self::AUDIO_MIMES).'.',
        ]);

        $wasPremium = (bool) $podcast->is_premium;
        $willBePremium = array_key_exists('is_premium', $data)
            ? (bool) $data['is_premium']
            : $wasPremium;

        if ($request->hasFile('audio')) {
            if ($podcast->audio_path) {
                Storage::disk($podcast->audioDisk())->delete($podcast->audio_path);
            }
            $data['audio_path'] = $request->file('audio')->store(
                'podcasts',
                $willBePremium ? 'local' : 'public'
            );
        } elseif ($podcast->audio_path && $wasPremium !== $willBePremium) {
            $this->moveAudio($podcast, $willBePremium ? 'local' : 'public');
        }
        unset($data['audio']);

        if ($request->hasFile('image')) {
            if ($podcast->image_path) {
                Storage::disk('public')->delete($podcast->image_path);
            }
            $data['image_path'] = $request->file('image')->store('podcasts', 'public');
        }
        unset($data['image']);

        $podcast->update(array_merge($data, ['transcript' => $data['transcript'] ?? '']));

        return response()->json($podcast);
    }

    public function destroy(Request $request, Podcast $podcast)
    {
        abort_unless($request->user()->is_admin, 403);

        // Draft episodes can be created before an audio recording is uploaded.
        // FilesystemAdapter::delete(null) is not a valid path and can turn an
        // otherwise ordinary delete into a production 500.
        if ($podcast->audio_path) {
            Storage::disk($podcast->audioDisk())->delete($podcast->audio_path);
        }
        if ($podcast->image_path) {
            Storage::disk('public')->delete($podcast->image_path);
        }
        $podcast->delete();

        return response()->json(['message' => 'Deleted']);
    }

    private function premiumLocked(Request $request, Podcast $podcast): bool
    {
        $user = $request->user();

        return (bool) $podcast->is_premium
            && ! $user->is_pro
            && ! $user->is_admin;
    }

    /** Move an existing recording between public and private storage. */
    private function moveAudio(Podcast $podcast, string $toDisk): void
    {
        $fromDisk = $podcast->audioDisk();
        if ($fromDisk === $toDisk || ! Storage::disk($fromDisk)->exists($podcast->audio_path)) {
            return;
        }

        $stream = Storage::disk($fromDisk)->readStream($podcast->audio_path);
        abort_unless(is_resource($stream), 500, 'Verbo could not move this episode audio.');

        try {
            $written = Storage::disk($toDisk)->put($podcast->audio_path, $stream);
        } finally {
            fclose($stream);
        }

        abort_unless($written, 500, 'Verbo could not move this episode audio.');
        Storage::disk($fromDisk)->delete($podcast->audio_path);
    }
}
