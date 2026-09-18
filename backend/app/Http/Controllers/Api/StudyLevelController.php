<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyLevel;
use App\Models\StudyUnit;
use App\Models\StudyUnitCompletion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class StudyLevelController extends Controller
{
    /**
     * Which topic shelves a stated interest or goal points at.
     *
     * Kept as one map so the "Recommended because…" sentence and the score
     * that produced it can never disagree — the same rule
     * RecommendationService::POINTS follows for articles. Anything not listed
     * simply contributes nothing rather than guessing.
     */
    private const PREFERENCE_GROUPS = [
        // learning_preferences.interests
        'Travel' => 'Travel',
        'Food' => 'Food & Restaurants',
        'Business' => 'Work',
        'School' => 'Education',
        'Daily Life' => 'Daily Life',
        'Shopping' => 'Shopping',
        // learning_preferences.goals
        'Business Chinese' => 'Work',
        'Study / Education' => 'Education',
        'Everyday Chinese' => 'Daily Life',
        'Speaking & Conversation' => 'Social',
    ];

    /**
     * The Daily Use listing: what to try, what others use, and everything else
     * shelved by situation.
     *
     * One request rather than three, because the three sections are slices of
     * the same small set of topics — fetching them separately would read the
     * table three times to answer one page.
     *
     * Every number here is real. "Popular" counts actual opens from
     * `recent_views`; "Recommended" comes from the learner's own stated
     * interests and goals and says which one earned it. Where there is nothing
     * true to say the section is omitted rather than padded — a new account
     * with no preferences gets no Recommended shelf instead of a fake one.
     */
    public function daily(Request $request)
    {
        $levels = StudyLevel::query()
            ->select(['id', 'title', 'description', 'level_label', 'image_path', 'banner_path', 'accent_color', 'category', 'topic_group', 'emoji'])
            ->where('category', 'daily')
            ->withCount('units')
            ->get();

        /* Opens per topic, counted through the units that belong to it. Topics
           nobody has opened simply score 0 — absence of data, not a failure. */
        $opens = \DB::table('recent_views')
            ->join('study_units', 'study_units.id', '=', 'recent_views.viewable_id')
            ->where('recent_views.viewable_type', \App\Models\StudyUnit::class)
            ->selectRaw('study_units.study_level_id as level_id, count(*) as opens')
            ->groupBy('study_units.study_level_id')
            ->pluck('opens', 'level_id');

        $prefs = $request->user()->learningPreference;
        $wanted = [];

        foreach (array_merge($prefs->interests ?? [], $prefs->goals ?? []) as $pick) {
            if (isset(self::PREFERENCE_GROUPS[$pick])) {
                // Keep the first thing that pointed here, so the reason names
                // something the learner actually chose.
                $wanted[self::PREFERENCE_GROUPS[$pick]] ??= $pick;
            }
        }

        $recommended = $levels
            // A topic with no lessons cannot be recommended — it would open
            // onto an empty page.
            ->filter(fn ($l) => $l->units_count > 0 && isset($wanted[$l->topic_group]))
            ->map(function ($l) use ($wanted) {
                $l->reason = 'Recommended for your interest in '.$wanted[$l->topic_group];

                return $l;
            })
            ->take(3)
            ->values();

        $popular = $levels
            ->filter(fn ($l) => ($opens[$l->id] ?? 0) > 0)
            ->sortByDesc(fn ($l) => $opens[$l->id] ?? 0)
            ->take(4)
            ->values();

        /* Grouped for the "All topics" shelves. Ordered by the model's own
           list so the headings are stable between visits rather than following
           whatever order the rows came back in. */
        $groups = [];

        foreach (StudyLevel::TOPIC_GROUPS as $name) {
            $inGroup = $levels->where('topic_group', $name)->values();
            if ($inGroup->isNotEmpty()) {
                $groups[] = ['name' => $name, 'topics' => $inGroup];
            }
        }

        $ungrouped = $levels->whereNull('topic_group')->values();

        if ($ungrouped->isNotEmpty()) {
            // Shown rather than hidden: an unfiled topic is still a topic, and
            // dropping it would make content silently unreachable.
            $groups[] = ['name' => 'More topics', 'topics' => $ungrouped];
        }

        return response()->json([
            'recommended' => $recommended,
            'popular' => $popular,
            'groups' => $groups,
        ]);
    }

    public function index(Request $request)
    {
        // Natural sort by title so the carousel runs HSK 1..5 in order,
        // regardless of the order the levels were created in. SORT_NATURAL
        // also keeps "HSK 10" after "HSK 9" rather than after "HSK 1".
        // units_count lets the Dashboard pick the level with the most content
        // to feature, instead of whichever happens to sort first.
        $levels = StudyLevel::query()
            ->select(['id', 'title', 'description', 'level_label', 'image_path', 'banner_path', 'accent_color', 'category'])
            ->withCount('units')
            ->get()
            ->sortBy('title', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();

        /* How far into each level this learner has got, counted as units they
           have OPENED — which is the only thing the app actually records.
           Nothing marks a unit finished, so this can never be called
           "complete" without claiming more than the data knows. The Profile
           page derives its progress the same way; the two must agree.

           One grouped query for every level rather than one per card, and
           `recent_views` is unique on (user, type, id), so a plain count is
           already a count of DISTINCT units. */
        $opened = DB::table('recent_views')
            ->join('study_units', 'study_units.id', '=', 'recent_views.viewable_id')
            ->where('recent_views.viewable_type', StudyUnit::class)
            ->where('recent_views.user_id', $request->user()->id)
            ->selectRaw('study_units.study_level_id as level_id, count(*) as opened')
            ->groupBy('study_units.study_level_id')
            ->pluck('opened', 'level_id');

        foreach ($levels as $level) {
            // (int) because SQLite hands aggregates back as strings, and the
            // client divides with this.
            $level->units_opened = (int) ($opened[$level->id] ?? 0);
        }

        return $levels;
    }

    /**
     * Units carry vocabulary/grammar counts so the module cards can show
     * "27 words · 3 Grammar" without the frontend fetching each unit.
     */
    public function show(Request $request, StudyLevel $studyLevel)
    {
        $studyLevel->load([
            'units' => fn ($q) => $q
                ->select('id', 'study_level_id', 'lesson_label', 'title', 'description')
                ->withCount(['vocabulary', 'grammarPoints'])
                ->orderBy('id'),
        ]);

        /* Which of these the viewer has finished, in one query, so the module
           list can grey out the lessons already done. */
        $done = StudyUnitCompletion::where('user_id', $request->user()->id)
            ->whereIn('study_unit_id', $studyLevel->units->pluck('id'))
            ->pluck('study_unit_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $studyLevel->units->each(fn ($unit) => $unit->setAttribute('completed', in_array((int) $unit->id, $done, true)));

        return $studyLevel;
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'level_label' => ['nullable', 'string', 'max:255'],
            'accent_color' => ['nullable', 'string', 'max:32'],
            'category' => ['nullable', 'string', 'in:hsk,daily'],
            'image' => ['nullable', 'image', 'max:10240'],
            'banner' => ['nullable', 'image', 'max:10240'],
        ]);

        $data['category'] = $data['category'] ?? 'hsk';

        if ($request->hasFile('image')) {
            $data['image_path'] = $request->file('image')->store('study-levels', 'public');
        }
        if ($request->hasFile('banner')) {
            $data['banner_path'] = $request->file('banner')->store('study-levels', 'public');
        }
        unset($data['image'], $data['banner']);

        $level = $request->user()->studyLevels()->create($data);

        return response()->json($level, 201);
    }

    public function update(Request $request, StudyLevel $studyLevel)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'level_label' => ['nullable', 'string', 'max:255'],
            'accent_color' => ['nullable', 'string', 'max:32'],
            'category' => ['nullable', 'string', 'in:hsk,daily'],
            'image' => ['nullable', 'image', 'max:10240'],
            'banner' => ['nullable', 'image', 'max:10240'],
        ]);

        if ($request->hasFile('image')) {
            if ($studyLevel->image_path) {
                Storage::disk('public')->delete($studyLevel->image_path);
            }
            $data['image_path'] = $request->file('image')->store('study-levels', 'public');
        }
        if ($request->hasFile('banner')) {
            if ($studyLevel->banner_path) {
                Storage::disk('public')->delete($studyLevel->banner_path);
            }
            $data['banner_path'] = $request->file('banner')->store('study-levels', 'public');
        }
        unset($data['image'], $data['banner']);

        $studyLevel->update($data);

        return response()->json($studyLevel);
    }

    public function destroy(Request $request, StudyLevel $studyLevel)
    {
        abort_unless($request->user()->is_admin, 403);

        foreach ([$studyLevel->image_path, $studyLevel->banner_path] as $path) {
            if ($path) {
                Storage::disk('public')->delete($path);
            }
        }

        $studyLevel->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
