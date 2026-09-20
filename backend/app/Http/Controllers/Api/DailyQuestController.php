<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DailyQuest;
use App\Services\DailyQuests;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * Today's three quests, and the two ways a learner may steer them.
 *
 * THE LEARNER CHOOSES WITHIN THE STRUCTURE, NEVER OUTSIDE IT. A swap only
 * offers quests from the SAME area, and a target only moves between three
 * named levels, so a day is always one input + one vocabulary + one practice
 * quest and no target can be typed in. That is the whole design: hand over
 * control of WHICH and HOW MUCH, keep control of the shape.
 *
 * Both writes are capped or fixed for the same reason - without that, the
 * picker becomes a way to shop for whichever quest happens to be finished
 * already, which turns the card into decoration.
 */
class DailyQuestController extends Controller
{
    public function index(Request $request, DailyQuests $quests)
    {
        return response()->json(['quests' => $quests->forToday($request->user())]);
    }

    /** Swap this area's quest for another in the same area. */
    public function change(Request $request, DailyQuest $dailyQuest, DailyQuests $quests)
    {
        $this->authorizeQuest($request, $dailyQuest);

        $data = $request->validate([
            'key' => ['required', Rule::in(array_keys(DailyQuests::QUESTS))],
        ]);

        if (DailyQuests::QUESTS[$data['key']]['area'] !== $dailyQuest->area) {
            return response()->json(['message' => 'That quest belongs to a different area.'], 422);
        }

        if ($dailyQuest->changes_used >= DailyQuests::MAX_CHANGES) {
            return response()->json(
                ['message' => "You've already changed this quest twice today."],
                422
            );
        }

        // Swapping to the one already showing is not a change, so it costs
        // nothing rather than quietly spending one of the two.
        if ($data['key'] !== $dailyQuest->quest_key) {
            $dailyQuest->quest_key = $data['key'];
            $dailyQuest->changes_used++;
            $dailyQuest->save();
        }

        return response()->json(['quest' => $quests->describe($request->user(), $dailyQuest)]);
    }

    /** Move this quest between easy / normal / hard. */
    public function target(Request $request, DailyQuest $dailyQuest, DailyQuests $quests)
    {
        $this->authorizeQuest($request, $dailyQuest);

        $data = $request->validate([
            'level' => ['required', Rule::in(DailyQuests::LEVELS)],
        ]);

        $dailyQuest->update(['level' => $data['level']]);

        return response()->json(['quest' => $quests->describe($request->user(), $dailyQuest)]);
    }

    /** What else this area offers, for the change sheet. */
    public function options(Request $request, DailyQuest $dailyQuest, DailyQuests $quests)
    {
        $this->authorizeQuest($request, $dailyQuest);

        return response()->json([
            'area' => $dailyQuest->area,
            'current' => $dailyQuest->quest_key,
            'changes_left' => max(0, DailyQuests::MAX_CHANGES - $dailyQuest->changes_used),
            'options' => $quests->alternatives($dailyQuest->area, $dailyQuest->quest_key),
            'levels' => array_map(fn ($level) => [
                'level' => $level,
                'target' => DailyQuests::QUESTS[$dailyQuest->quest_key]['levels'][$level],
                'label' => $quests->label($dailyQuest->quest_key, DailyQuests::QUESTS[$dailyQuest->quest_key]['levels'][$level]),
            ], DailyQuests::LEVELS),
        ]);
    }

    /**
     * Yours, and TODAY'S. The id alone would let someone edit yesterday's
     * row, which no screen shows and which would rewrite history.
     */
    private function authorizeQuest(Request $request, DailyQuest $quest): void
    {
        abort_unless((int) $quest->user_id === $request->user()->id, 403);
        abort_unless($quest->day === Carbon::today()->toDateString(), 404);
    }
}
