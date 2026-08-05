<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyQuizQuestion;
use App\Models\StudyUnit;
use Illuminate\Http\Request;

class StudyQuizQuestionController extends Controller
{
    public function store(Request $request, StudyUnit $studyUnit)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'question' => ['required', 'string', 'max:255'],
            'option_a' => ['required', 'string', 'max:255'],
            'option_b' => ['required', 'string', 'max:255'],
            'option_c' => ['required', 'string', 'max:255'],
            'option_d' => ['required', 'string', 'max:255'],
            'correct_option' => ['required', 'in:a,b,c,d'],
        ]);

        $question = $studyUnit->quizQuestions()->create($data);

        return response()->json($question, 201);
    }

    public function destroy(Request $request, StudyQuizQuestion $studyQuizQuestion)
    {
        abort_unless($request->user()->is_admin, 403);

        $studyQuizQuestion->delete();

        return response()->json(['message' => 'Deleted']);
    }

    public function check(Request $request, StudyQuizQuestion $studyQuizQuestion)
    {
        $data = $request->validate([
            'selected' => ['required', 'in:a,b,c,d'],
        ]);

        $correct = $data['selected'] === $studyQuizQuestion->correct_option;

        return response()->json([
            'correct' => $correct,
            'correct_option' => $studyQuizQuestion->correct_option,
        ]);
    }
}
