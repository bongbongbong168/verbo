<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LearningPreference;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LearningPreferenceController extends Controller
{
    /**
     * The user's preferences plus the option lists.
     *
     * The options ride along with the values so the settings UI never carries
     * its own copy of the lists — a hard-coded list in the client is how it
     * drifts from what the validator will actually accept.
     */
    public function show(Request $request)
    {
        $prefs = $request->user()->learningPreference;

        return response()->json([
            'preferences' => $prefs ? [
                'chinese_level' => $prefs->chinese_level,
                'hsk_level' => $prefs->hsk_level,
                'goals' => $prefs->goals ?? [],
                'focus' => $prefs->focus ?? [],
                'interests' => $prefs->interests ?? [],
                'styles' => $prefs->styles ?? [],
                'daily_goal' => $prefs->daily_goal,
                'study_time' => $prefs->study_time,
            ] : null,
            'options' => [
                'chinese_level' => LearningPreference::CHINESE_LEVELS,
                'hsk_level' => LearningPreference::HSK_LEVELS,
                'goals' => LearningPreference::GOALS,
                'focus' => LearningPreference::FOCUS,
                'interests' => LearningPreference::INTERESTS,
                'styles' => LearningPreference::STYLES,
                'daily_goal' => LearningPreference::DAILY_GOALS,
                'study_time' => LearningPreference::STUDY_TIMES,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'chinese_level' => ['nullable', Rule::in(LearningPreference::CHINESE_LEVELS)],
            'hsk_level' => ['nullable', Rule::in(LearningPreference::HSK_LEVELS)],
            'goals' => ['nullable', 'array'],
            'goals.*' => [Rule::in(LearningPreference::GOALS)],
            'focus' => ['nullable', 'array'],
            'focus.*' => [Rule::in(LearningPreference::FOCUS)],
            'interests' => ['nullable', 'array'],
            'interests.*' => [Rule::in(LearningPreference::INTERESTS)],
            'styles' => ['nullable', 'array'],
            'styles.*' => [Rule::in(LearningPreference::STYLES)],
            'daily_goal' => ['nullable', Rule::in(LearningPreference::DAILY_GOALS)],
            'study_time' => ['nullable', Rule::in(LearningPreference::STUDY_TIMES)],
        ]);

        // Through the relation so user_id is set directly rather than by mass
        // assignment — the same reason flashcards()/scans() do.
        $prefs = $request->user()->learningPreference()->updateOrCreate([], [
            'chinese_level' => $data['chinese_level'] ?? null,
            'hsk_level' => $data['hsk_level'] ?? null,
            'goals' => array_values($data['goals'] ?? []),
            'focus' => array_values($data['focus'] ?? []),
            'interests' => array_values($data['interests'] ?? []),
            'styles' => array_values($data['styles'] ?? []),
            'daily_goal' => $data['daily_goal'] ?? null,
            'study_time' => $data['study_time'] ?? null,
        ]);

        return response()->json($prefs->fresh());
    }
}
