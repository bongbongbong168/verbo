<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Flashcard;
use App\Models\LearningPreference;
use App\Models\StudyUnit;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The Dashboard's "where am I, and what is left today" card.
 *
 * Two bands in one payload because they are one card and the Dashboard
 * already fans out to eight requests: the PLAN (which level, how much of it
 * is left, at what pace) and TODAY (three small goals).
 *
 * NOTHING HERE IS STORED. Every figure is counted from rows the app already
 * writes for its own reasons, so there is no table, no progress column and
 * nothing to keep in step — the same reason "My Courses" computes its week
 * from `starts_on` rather than keeping a week number that a missed job would
 * silently falsify.
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
    /**
     * Targets are FIXED, and they live here so the card cannot drift from
     * what the server counts — same rule as `LearningPreference`'s option
     * lists and `PracticeChatController::TOPICS`.
     *
     * Randomising them ("review 23 words") buys nothing and makes the day
     * impossible to plan around. Per-user difficulty tiers are a real idea
     * but a later one, and nothing in this shape blocks them.
     */
    private const TARGETS = [
        'read_article' => 1,
        'review_words' => 5,
        'save_words' => 3,
    ];

    private const LABELS = [
        'read_article' => 'Read an article',
        'review_words' => 'Review 5 words',
        'save_words' => 'Save 3 new words',
    ];

    public function index(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'plan' => $this->plan($user),
            'goals' => $this->goals($user),
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

    /** Today's three, counted rather than stored. */
    private function goals($user): array
    {
        /* `Carbon::today()` in the app timezone — the same boundary
           ActivityController uses for the streak and the chart. Two notions of
           "today" on one Dashboard would have them roll over at different
           moments. */
        $since = Carbon::today();

        $progress = [
            // Distinct articles opened today: `article_views` is one row per
            // user per article, so re-opening one does not count twice.
            'read_article' => DB::table('article_views')
                ->where('user_id', $user->id)
                ->where('last_viewed_at', '>=', $since)
                ->count(),

            /* Distinct WORDS reviewed, not answers given. `last_reviewed_at`
               is stamped on every answer, so drilling one card ten times still
               counts once — which is the honest reading of "review 5 words"
               and stops the goal being farmed on a single card. */
            'review_words' => Flashcard::where('user_id', $user->id)
                ->whereNotNull('last_reviewed_at')
                ->where('last_reviewed_at', '>=', $since)
                ->count(),

            'save_words' => Flashcard::where('user_id', $user->id)
                ->where('created_at', '>=', $since)
                ->count(),
        ];

        $goals = [];

        foreach (self::TARGETS as $type => $target) {
            $goals[] = [
                'type' => $type,
                'label' => self::LABELS[$type],
                'target' => $target,
                // Clamped: 40 words saved has done the goal, and a bar
                // reporting 40/3 reads as a broken widget.
                'progress' => min($progress[$type], $target),
                'done' => $progress[$type] >= $target,
            ];
        }

        return $goals;
    }
}
