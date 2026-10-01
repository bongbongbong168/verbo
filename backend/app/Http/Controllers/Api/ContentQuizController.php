<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\ContentQuiz;
use App\Models\Podcast;
use App\Services\ContentQuizService;
use App\Services\UsageAllowanceService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * The optional practice quiz under an article or a podcast.
 *
 * GET never calls Gemini: it returns the saved quiz or null. POST is the only
 * way one is made, and only when the piece has none yet (or its text changed
 * since) - so the first learner who asks pays one AI message from their own
 * allowance and everyone after reads the same saved quiz for free.
 */
class ContentQuizController extends Controller
{
    public function showArticle(Request $request, Article $article)
    {
        return $this->show($request, $article, (string) $article->body);
    }

    public function storeArticle(Request $request, Article $article, ContentQuizService $quizzes, UsageAllowanceService $allowances)
    {
        return $this->store($request, $article, (string) $article->body, $quizzes, $allowances);
    }

    public function showPodcast(Request $request, Podcast $podcast)
    {
        return $this->show($request, $podcast, (string) $podcast->transcript);
    }

    public function storePodcast(Request $request, Podcast $podcast, ContentQuizService $quizzes, UsageAllowanceService $allowances)
    {
        return $this->store($request, $podcast, (string) $podcast->transcript, $quizzes, $allowances);
    }

    private function show(Request $request, Model $item, string $source)
    {
        $this->guard($request, $item);
        $quiz = $this->find($item);

        return response()->json([
            'quiz' => $quiz && $quiz->source_hash === $this->hash($source) ? $quiz->questions : null,
            'available' => trim($source) !== '',
            'title' => $item->title,
        ]);
    }

    private function store(Request $request, Model $item, string $source, ContentQuizService $quizzes, UsageAllowanceService $allowances)
    {
        $this->guard($request, $item);

        if (trim($source) === '') {
            return response()->json(['message' => 'There is no text to make a quiz from yet.'], 422);
        }

        $hash = $this->hash($source);
        $existing = $this->find($item);
        if ($existing && $existing->source_hash === $hash) {
            return response()->json(['quiz' => $existing->questions, 'title' => $item->title]);
        }

        $reservation = $allowances->reserve($request->user(), UsageAllowanceService::AI_CHAT_MESSAGES);
        $questions = null;
        try {
            $questions = $quizzes->generate($source);
        } finally {
            if (! $questions) {
                $allowances->release($request->user(), UsageAllowanceService::AI_CHAT_MESSAGES, $reservation);
            }
        }

        if (! $questions) {
            return response()->json(['message' => 'Could not make a quiz right now. Please try again in a moment.'], 503);
        }

        $allowances->commit($request->user(), UsageAllowanceService::AI_CHAT_MESSAGES, $reservation);

        ContentQuiz::updateOrCreate(
            ['quizzable_type' => $item->getMorphClass(), 'quizzable_id' => $item->getKey()],
            ['questions' => $questions, 'source_hash' => $hash]
        );

        return response()->json(['quiz' => $questions, 'title' => $item->title]);
    }

    /** Premium pieces stay premium: their quiz is locked the same way. */
    private function guard(Request $request, Model $item): void
    {
        $user = $request->user();
        abort_if($item->is_premium && ! $user->is_pro && ! $user->is_admin, 403, 'Verbo Pro is required for this quiz.');
    }

    private function find(Model $item): ?ContentQuiz
    {
        return ContentQuiz::where('quizzable_type', $item->getMorphClass())
            ->where('quizzable_id', $item->getKey())
            ->first();
    }

    private function hash(string $source): string
    {
        return hash('sha256', trim($source));
    }
}
