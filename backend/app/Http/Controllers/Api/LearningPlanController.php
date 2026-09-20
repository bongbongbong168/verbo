<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Flashcard;
use App\Models\LearningPreference;
use App\Models\StudyUnit;
use App\Services\DailyQuests;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * The Dashboard's "where am I, and what is left today" card.
 *
 * Two bands in one payload because they are one card and the Dashboard
 * already fans out to eight requests: the PLAN (which level, how much of it
 * is left, at what pace) and TODAY (the three daily quests, built by
 * App\Services\DailyQuests).
 *
 * NO PROGRESS IS STORED. Every figure is counted from rows the app already
 * writes for its own reasons, so there is no progress column and nothing to
 * keep in step — the same reason "My Courses" computes its week from
 * `starts_on` rather than keeping a week number that a missed job would
 * silently falsify. The one thing `daily_quests` does store is the learner's
 * CHOICE of quest and difficulty, which cannot be recomputed from anything.
 *
 * THERE IS DELIBERATELY NO PROJECTED FINISH DATE. The reference this was
 * built from leads with "HSK 1 in 1 month and 9 days", and that number cannot
 * be honest here: nothing in Verbo measures how long a lesson takes, so the
 * date would be an assumption wearing the clothes of a measurement. The card
 * reports what is true — lessons left, at the pace you chose — and lets the
 * reader do the arithmetic they can already see.
 */
class LearningPlanController extends Controller
{
    public function index(Request $request, DailyQuests $quests)
    {
        $user = $request->user();

        return response()->json([
            'plan' => $this->plan($user),
            /* The day's three quests ride along rather than costing the
               Dashboard a ninth request. They REPLACED the three fixed goals
               that used to live here: one quest per learning area, each
               swappable and each with an easy / normal / hard target. */
            'quests' => $quests->forToday($user),
        ]);
    }

    /**
     * Which level, how far in, how much is left, at what stated pace.
     *
     * "Current level" is DERIVED from the last study unit opened, the same
     * rule ProfileController uses — there is no level column on `users`, and
     * adding one would be a second thing to keep in step with what the person
     * actually studies.
     */
    private function plan($user): ?array
    {
        $lastView = $user->recentViews()
            ->where('viewable_type', StudyUnit::class)
            ->orderByDesc('last_viewed_at')
            ->first();

        if (! $lastView) {
            // Nothing opened yet, so there is no level to report. The card
            // says "pick a level to start" rather than inventing one.
            return null;
        }

        $unit = StudyUnit::with('level:id,title,level_label')->find($lastView->viewable_id);

        // The unit or its level can be deleted after being opened.
        if (! $unit || ! $unit->level) {
            return null;
        }

        $unitIds = StudyUnit::where('study_level_id', $unit->level->id)->pluck('id');

        /* "Opened", never "completed" — nothing in the app records a unit as
           finished, so this is the only completion signal that exists and the
           card labels it as such. A "3 of 8 done" would claim more than the
           data knows. */
        $opened = $unitIds->isEmpty() ? 0 : $user->recentViews()
            ->where('viewable_type', StudyUnit::class)
            ->whereIn('viewable_id', $unitIds)
            ->count();

        $goal = optional($user->learningPreference)->daily_goal;

        return [
            'level_id' => $unit->level->id,
            'level' => $unit->level->title,
            /* The difficulty pill beside the title. REAL and admin-authored —
               `study_levels.level_label` already holds "Beginner level",
               "Upper intermediate level" and so on, which is the same column
               Daily Use reads. Nothing is derived from the HSK number here;
               inferring difficulty from curriculum naming is exactly what the
               Profile popover refused to do when it dropped its own
               "Intermediate" segment. Groomed server-side beside `pace_label`
               for the same reason: the card's context already says "level", so
               a trailing one in the label is the word said twice. */
            'level_label' => $this->levelLabel($unit->level->level_label),
            'units_total' => $unitIds->count(),
            'units_opened' => $opened,
            'units_left' => max(0, $unitIds->count() - $opened),
            'words_saved' => Flashcard::where('user_id', $user->id)->count(),
            /* The raw preference string, and the lessons-a-day it stands for.
               The mapping is a STATED RULE shown on the card, not a
               measurement — same footing as Flashcard::MASTERED_STREAK. */
            'daily_goal' => $goal,
            'lessons_per_day' => $this->lessonsPerDay($goal),
            // The words the card shows. Built here rather than in the client
            // because the option strings are not all groomable by one rule:
            // "15 minutes" + " a day" reads fine, "1 hour or more" + " a day"
            // does not. Shortened too — the rail gives this line ~170px.
            'pace_label' => $this->paceLabel($goal),
        ];
    }

    /**
     * "Beginner level" -> "Beginner", "Everyday level" -> "Everyday".
     *
     * One rule, applied only to a trailing word, so a label authored without
     * it ("Beginner") is returned untouched and one that uses the word in the
     * middle is never mangled.
     */
    private function levelLabel(?string $label): ?string
    {
        if (! $label) {
            return null;
        }

        return trim(preg_replace('/\s+level$/i', '', trim($label))) ?: null;
    }

    private function paceLabel(?string $goal): ?string
    {
        return [
            '15 minutes' => '15 min a day',
            '30 minutes' => '30 min a day',
            '45 minutes' => '45 min a day',
            '1 hour or more' => 'an hour+ a day',
        ][$goal] ?? null;
    }

    /**
     * "Whenever I have time" returns NULL, and that is the point.
     *
     * A pace cannot be derived from "whenever", so the card shows the lessons
     * left without a rate rather than quietly assuming one. That option exists
     * precisely for someone who will not commit to a number (see the note on
     * LearningPreference::DAILY_GOALS), and turning their honesty into a
     * silent assumption would be the one untrue thing on the card.
     */
    private function lessonsPerDay(?string $goal): ?int
    {
        return [
            '15 minutes' => 1,
            '30 minutes' => 2,
            '45 minutes' => 3,
            '1 hour or more' => 4,
        ][$goal] ?? null;
    }

}
