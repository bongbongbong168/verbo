<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\GeminiService;
use App\Services\UsageAllowanceService;
use Illuminate\Http\Request;

/**
 * The floating practice assistant's one endpoint.
 *
 * NOTHING IS STORED. The conversation lives in the widget's own state and is
 * re-sent each turn, which is why there is no table here and no `index`. That
 * is a deliberate scope line, not an omission: a saved chat is a new data
 * domain — history to list, rows to delete, a privacy question about what an
 * admin can read — and none of it helps the thing this is for, which is asking
 * "is this sentence right?" while reading an article.
 */
class PracticeChatController extends Controller
{
    /** The chips the widget offers. A closed list, so the prompt cannot be steered from the client. */
    public const TOPICS = ['Daily Chat', 'Travel', 'Food', 'Work', 'HSK', 'Free Chat'];

    public function store(Request $request, GeminiService $gemini, UsageAllowanceService $allowances)
    {
        $data = $request->validate([
            'messages' => ['required', 'array', 'min:1', 'max:'.GeminiService::MAX_HISTORY],
            'messages.*.role' => ['required', 'string', 'in:user,model'],
            // 2000 is far more than the window invites and still bounds what
            // one request can spend: the whole history is sent every turn.
            'messages.*.text' => ['required', 'string', 'max:2000'],
            /*
             * `in:` rather than free text. The topic is interpolated into the
             * system brief, so an open string would let a caller append their
             * own instructions to it — the client picking from a list the
             * server also holds is what closes that.
             */
            'topic' => ['nullable', 'string', 'in:'.implode(',', self::TOPICS)],
        ]);

        // The last turn has to be the learner's, or the model is being asked
        // to reply to itself.
        if (end($data['messages'])['role'] !== 'user') {
            return response()->json(['message' => 'The last message must be yours.'], 422);
        }

        $reservation = $allowances->reserve($request->user(), UsageAllowanceService::AI_CHAT_MESSAGES);

        try {
            $result = $gemini->reply($data['messages'], $data['topic'] ?? null);
        } catch (\Throwable $e) {
            $allowances->release($request->user(), UsageAllowanceService::AI_CHAT_MESSAGES, $reservation);
            throw $e;
        }

        if (! $result['ok']) {
            $allowances->release($request->user(), UsageAllowanceService::AI_CHAT_MESSAGES, $reservation);
            // 503, not 500: nothing here is broken, the upstream is
            // unavailable or declined. The widget shows `error` as a bubble.
            return response()->json(['message' => $result['error']], 503);
        }

        $usage = $allowances->commit(
            $request->user(),
            UsageAllowanceService::AI_CHAT_MESSAGES,
            $reservation
        );

        return response()->json(['reply' => $result['reply'], 'usage' => $usage]);
    }

    /**
     * Whether the assistant is usable, so the widget can stay hidden entirely
     * rather than offering a button that only ever errors.
     */
    public function status(Request $request, UsageAllowanceService $allowances)
    {
        return response()->json([
            'available' => GeminiService::configured(),
            'topics' => self::TOPICS,
            'usage' => $allowances->summary($request->user(), UsageAllowanceService::AI_CHAT_MESSAGES),
        ]);
    }
}
