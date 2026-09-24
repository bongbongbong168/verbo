<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Podcast;
use App\Models\SavedItem;
use App\Models\TutorProfile;
use Illuminate\Http\Request;

class SavedLibraryController extends Controller
{
    public function toggleTutor(Request $request, TutorProfile $tutorProfile)
    {
        abort_unless($tutorProfile->status === 'approved', 404);
        return $this->toggle($request, 'tutor', $tutorProfile->id);
    }

    public function togglePodcast(Request $request, Podcast $podcast)
    {
        return $this->toggle($request, 'podcast', $podcast->id);
    }

    public function index(Request $request)
    {
        $rows = SavedItem::where('user_id', $request->user()->id)
            ->latest('created_at')->latest('id')->get();

        $tutors = TutorProfile::approved()->with('user:id,name')
            ->whereIn('id', $rows->where('kind', 'tutor')->pluck('item_id'))
            ->get()->keyBy('id');
        $podcasts = Podcast::with('user:id,name')
            ->whereIn('id', $rows->where('kind', 'podcast')->pluck('item_id'))
            ->get()->keyBy('id');

        return [
            'tutors' => $this->shape($rows->where('kind', 'tutor'), $tutors),
            /* Saved podcasts are library cards, not episode payloads. Shape
               them explicitly so a premium transcript can never hitch a ride
               through Model::toArray(). */
            'podcasts' => $rows->where('kind', 'podcast')->map(function ($row) use ($podcasts) {
                $podcast = $podcasts->get($row->item_id);
                if (! $podcast) return null;

                return [
                    'id' => $podcast->id,
                    'title' => $podcast->title,
                    'level' => $podcast->level,
                    'category' => $podcast->category,
                    'bio' => $podcast->bio,
                    'host' => $podcast->host,
                    'image_url' => $podcast->image_url,
                    'is_premium' => (bool) $podcast->is_premium,
                    'saved_at' => $row->created_at,
                ];
            })->filter()->values()->all(),
        ];
    }

    private function toggle(Request $request, string $kind, int $itemId)
    {
        $row = SavedItem::where([
            'user_id' => $request->user()->id,
            'kind' => $kind,
            'item_id' => $itemId,
        ])->first();

        if ($row) {
            $row->delete();
            return ['saved' => false];
        }

        SavedItem::create(['user_id' => $request->user()->id, 'kind' => $kind, 'item_id' => $itemId]);
        return ['saved' => true];
    }

    private function shape($rows, $models): array
    {
        return $rows->map(fn ($row) => $models->get($row->item_id)
            ? array_merge($models->get($row->item_id)->toArray(), ['saved_at' => $row->created_at])
            : null)->filter()->values()->all();
    }
}
