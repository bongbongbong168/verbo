<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\Podcast;
use App\Models\StudyUnit;
use App\Services\DictionaryService;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RecentViewController extends Controller
{
    /**
     * What may be recorded, keyed by the short name the client sends.
     *
     * A whitelist rather than a free-form morph map: the type comes off the
     * request, so without it a caller could point a row at any model in the
     * app and have the Dashboard render it.
     */
    private const TYPES = [
        'study_unit' => StudyUnit::class,
        'podcast' => Podcast::class,
        'article' => Article::class,
    ];

    /**
     * Record that the user opened something. Called by the unit and episode
     * pages on load, so it is deliberately cheap and idempotent: one row per
     * user per thing, with the timestamp moved forward on every revisit.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(array_keys(self::TYPES))],
            'id' => ['required', 'integer'],
        ]);

        $class = self::TYPES[$data['type']];
        // 404 rather than storing a row that points at nothing — a dangling
        // row would just be skipped on read, silently and forever.
        $model = $class::findOrFail($data['id']);

        // Through the relation so user_id is set directly rather than by mass
        // assignment — same reason flashcards()/scans() do.
        $request->user()->recentViews()->updateOrCreate(
            ['viewable_type' => $class, 'viewable_id' => $model->id],
            ['last_viewed_at' => now()]
        );

        return response()->json(['message' => 'Recorded']);
    }

    /**
     * The newest things the user opened, most recent first, shaped for the
     * Dashboard's "Pick up where you left off" tiles.
     *
     * Returns an empty array — not 204 — when there is nothing: the Dashboard
     * pads the row with suggestions either way, so an empty list is an ordinary
     * result rather than a state the client has to branch on.
     */
    public function index(Request $request)
    {
        $limit = min(max((int) $request->query('limit', 3), 1), 12);

        $rows = $request->user()->recentViews()
            /* morphWith so the study units arrive with their level already
               loaded — without it each unit's level is a separate query. */
            ->with(['viewable' => function (MorphTo $morphTo) {
                $morphTo->morphWith([StudyUnit::class => ['level']]);
            }])
            ->orderByDesc('last_viewed_at')
            // Over-fetch: rows whose target has since been deleted are dropped
            // below, and a short read should still be able to fill the row.
            ->limit($limit * 2)
            ->get();

        $items = [];

        foreach ($rows as $row) {
            $item = $this->shape($row);
            if ($item) {
                $items[] = $item;
            }
            if (count($items) >= $limit) {
                break;
            }
        }

        return response()->json($items);
    }

    /**
     * One row as a tile, or null when its target is gone. The three kinds carry
     * different fields on purpose — the Dashboard renders a different card for
     * each — so `kind` is what the client switches on.
     */
    private function shape($row): ?array
    {
        $thing = $row->viewable;

        // The unit/podcast (or a unit's level) can be deleted after being
        // viewed; guard rather than 500 on null.
        if (! $thing) {
            return null;
        }

        $base = [
            'kind' => array_search(get_class($thing), self::TYPES, true),
            'last_viewed_at' => $row->last_viewed_at,
        ];

        if ($thing instanceof StudyUnit) {
            if (! $thing->level) {
                return null;
            }

            // 1-based position within the level, so the tile can say "Unit N".
            $position = StudyUnit::where('study_level_id', $thing->study_level_id)
                ->where('id', '<=', $thing->id)
                ->count();

            return $base + [
                'unit' => [
                    'id' => $thing->id,
                    'title' => $thing->title,
                    'description' => $thing->description,
                    'lesson_label' => $thing->lesson_label,
                    'position' => $position,
                    /* The reading for the Chinese half of the title, so the
                       card can print it under the characters the way every
                       other Chinese line in the app is printed. Derived from
                       CC-CEDICT by the same service Read, Podcast and Study
                       use — nothing is stored and nothing is guessed. */
                    'title_pinyin' => $this->pinyinForTitle($thing->title),
                ],
                'level' => [
                    'id' => $thing->level->id,
                    'title' => $thing->level->title,
                    'image_url' => $thing->level->image_url,
                ],
            ];
        }

        if ($thing instanceof Article) {
            return $base + [
                'article' => [
                    'id' => $thing->id,
                    'title' => $thing->title,
                    // FORMAT (article/story/funfact) and TOPIC are different
                    // questions — the card shows the first as a badge on the
                    // cover and the second in the line beneath, exactly as the
                    // Read shelves do.
                    'type' => $thing->type,
                    'category' => $thing->category,
                    'hsk_level' => $thing->hsk_level,
                    'image_url' => $thing->image_url,
                    // Derived from the body, never stored — the accessor has
                    // the body here because the morph load selects the whole
                    // row, so no extra query and no `body` on the wire.
                    'reading_minutes' => $thing->reading_minutes,
                ],
            ];
        }

        return $base + [
            'podcast' => [
                'id' => $thing->id,
                'title' => $thing->title,
                'level' => $thing->level,
                'image_url' => $thing->image_url,
            ],
        ];
    }

    /**
     * Unit titles are authored "中文 - English", so the reading is for the left
     * half only — running the whole string through would put pinyin under the
     * English words too. Split on the FIRST dash with optional spaces, the
     * same rule the Dashboard uses, and only when that half actually holds Han
     * characters: an English title containing a hyphen is left alone and gets
     * no reading at all.
     */
    private function pinyinForTitle(?string $title): ?string
    {
        $title = trim((string) $title);
        if ($title === '') {
            return null;
        }

        $chinese = preg_match('/^(.*?)\s*[-–—]\s*(.+)$/u', $title, $m) ? trim($m[1]) : $title;

        if (! preg_match('/\p{Han}/u', $chinese)) {
            return null;
        }

        return app(DictionaryService::class)->pinyinFor($chinese) ?: null;
    }
}
