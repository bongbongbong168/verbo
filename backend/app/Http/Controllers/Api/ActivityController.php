<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class ActivityController extends Controller
{
    /**
     * Dashboard side column: a merged feed of what the user recently did,
     * plus the flashcard tally.
     *
     * Everything here is derived from records the app already writes — saved
     * words, scans and tutor requests. Nothing new is tracked. Each source is
     * queried with its own LIMIT so this stays three small indexed reads no
     * matter how much history a user builds up.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $limit = 8;

        $flashcards = $user->flashcards()
            ->latest()
            ->take($limit)
            ->get(['id', 'word', 'translation', 'source_module', 'created_at'])
            ->map(fn ($f) => [
                'type' => 'flashcard',
                'title' => $f->word,
                'detail' => $f->translation,
                'source' => $f->source_module,
                'at' => $f->created_at,
            ]);

        $scans = $user->scans()
            ->latest()
            ->take($limit)
            ->get(['id', 'original_filename', 'created_at'])
            ->map(fn ($s) => [
                'type' => 'scan',
                'title' => $s->original_filename ?: 'Untitled scan',
                'detail' => null,
                'source' => 'scan',
                'at' => $s->created_at,
            ]);

        $bookings = $user->bookingsAsStudent()
            ->with('tutor:id,name')
            ->latest()
            ->take($limit)
            ->get(['id', 'tutor_id', 'status', 'created_at'])
            ->map(fn ($b) => [
                'type' => 'booking',
                'title' => $b->tutor->name ?? 'a tutor',
                'detail' => $b->status,
                'source' => 'tutor',
                'at' => $b->created_at,
            ]);

        $items = $flashcards
            ->concat($scans)
            ->concat($bookings)
            ->sortByDesc('at')
            ->take($limit)
            ->values();

        // Counted in SQL rather than by loading every row.
        $byModule = $user->flashcards()
            ->selectRaw('source_module, COUNT(*) as total')
            ->groupBy('source_module')
            ->pluck('total', 'source_module');

        return [
            'items' => $items,
            'stats' => [
                'total' => (int) $byModule->sum(),
                'by_module' => $byModule,
            ],
        ];
    }
}
