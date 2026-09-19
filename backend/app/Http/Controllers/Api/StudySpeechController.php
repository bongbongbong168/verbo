<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyTextLine;
use App\Models\StudyVocabulary;
use App\Services\SpeechService;
use Illuminate\Http\Request;

/**
 * Make (or find) the spoken clip for one piece of Study content.
 *
 * The client names the ROW, never the text. Taking free text would let any
 * signed-in account spend the app's Gemini quota on whatever it liked; a row
 * id can only ever produce audio for words and lines an admin has published.
 * Most plays never reach here at all - the unit payload already carries the
 * URL of every clip that exists - so this runs once per new word or line.
 */
class StudySpeechController extends Controller
{
    public function store(Request $request, SpeechService $speech)
    {
        $data = $request->validate([
            'kind' => ['required', 'in:word,line'],
            'id' => ['required', 'integer'],
        ]);

        $voice = null;
        if ($data['kind'] === 'word') {
            $text = StudyVocabulary::whereKey($data['id'])->value('hanzi');
        } else {
            $line = StudyTextLine::with('text.lines')->find($data['id']);
            $text = $line?->chinese;
            // Each speaker keeps one voice: a boy's or a girl's.
            $voice = $line?->text?->voiceFor($line->speaker);
        }

        abort_if(blank($text), 404);

        $url = $speech->urlFor($text, $data['kind'], $voice);

        // 503 with a plain sentence: the page falls back to the browser's
        // voice, so the learner still hears the word.
        return $url
            ? response()->json(['url' => $url])
            : response()->json(['message' => 'Audio is not available right now.'], 503);
    }
}
