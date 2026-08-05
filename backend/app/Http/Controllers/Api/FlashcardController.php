<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Flashcard;
use Illuminate\Http\Request;

class FlashcardController extends Controller
{
    /**
     * Paginated because this is the one table that grows without bound —
     * every module auto-saves words here, so a committed learner accumulates
     * thousands. Returns Laravel's paginator shape: {data, current_page,
     * last_page, total, ...}. The frontend appends pages via "Load more".
     */
    public function index(Request $request)
    {
        // orderByDesc('id') is the tiebreaker, not decoration: cards saved in
        // the same second share a created_at, and a sort with ties has no
        // stable order across pages — rows can repeat or be skipped. SQLite
        // happens to be consistent here; Postgres guarantees nothing.
        return $request->user()->flashcards()
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(50);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'word' => ['required', 'string', 'max:255'],
            'pinyin' => ['nullable', 'string', 'max:255'],
            'translation' => ['nullable', 'string', 'max:255'],
            'source_module' => ['nullable', 'string', 'max:255'],
        ]);

        $data['source_module'] = $data['source_module'] ?? 'manual';

        $flashcard = $request->user()->flashcards()->create($data);

        return response()->json($flashcard, 201);
    }

    public function destroy(Request $request, Flashcard $flashcard)
    {
        if ((int) $flashcard->user_id !== $request->user()->id) {
            abort(403);
        }

        $flashcard->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
