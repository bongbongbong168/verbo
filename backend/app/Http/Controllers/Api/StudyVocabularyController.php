<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudyUnit;
use App\Models\StudyVocabulary;
use App\Services\DictionaryService;
use App\Services\ExampleFinder;
use Illuminate\Http\Request;

class StudyVocabularyController extends Controller
{
    public function store(Request $request, StudyUnit $studyUnit, DictionaryService $dictionary)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'hanzi' => ['required', 'string', 'max:255'],
            'pinyin' => ['nullable', 'string', 'max:255'],
            'translation' => ['nullable', 'string', 'max:255'],
            'explanation' => ['nullable', 'string'],
        ]);

        // Fill the gaps from the offline CEDICT index so a word is useful the
        // moment it is added; anything typed in explicitly wins. The ?? matters:
        // validate() omits keys the request never sent.
        $data['pinyin'] = ($data['pinyin'] ?? null) ?: $dictionary->pinyinFor($data['hanzi']);
        $data['explanation'] = ($data['explanation'] ?? null) ?: $dictionary->lookup($data['hanzi']);

        $word = $studyUnit->vocabulary()->create($data);

        return response()->json($word, 201);
    }

    /**
     * Everything the word's explanation panel shows: what it means, what its
     * characters contribute, and real sentences it appears in.
     *
     * Every part is REAL — no generated prose. The meaning and the character
     * breakdown come from the offline CC-CEDICT index the hover translations
     * already use, and the examples come from the learner's own library
     * (study conversations first, since those are authored as teaching
     * material and ship a human translation). Nothing here invents a sentence
     * or a usage note; where an admin has written one, that is what carries
     * the "how to use it", and it leads the panel.
     */
    public function explain(
        Request $request,
        StudyVocabulary $studyVocabulary,
        DictionaryService $dictionary,
        ExampleFinder $finder
    ) {
        $word = $studyVocabulary->hanzi;

        $characters = [];

        // A single character has no parts to break into — the "breakdown"
        // would just repeat the word.
        if (mb_strlen($word) > 1) {
            foreach (preg_split('//u', $word, -1, PREG_SPLIT_NO_EMPTY) as $char) {
                if ($meaning = $dictionary->lookup($char)) {
                    $characters[] = [
                        'char' => $char,
                        'pinyin' => $dictionary->pinyinForTerm($char),
                        'meaning' => $meaning,
                    ];
                }
            }

            // All or nothing: a partial breakdown implies the missing
            // characters carry no meaning, which is not what it would mean.
            if (count($characters) !== mb_strlen($word)) {
                $characters = [];
            }
        }

        return response()->json([
            'hanzi' => $word,
            'pinyin' => $studyVocabulary->pinyin ?: $dictionary->pinyinFor($word),
            'translation' => $studyVocabulary->translation,
            // What the dictionary knows, which is often fuller than the short
            // gloss the vocabulary row carries.
            'dictionary' => $dictionary->lookup($word),
            'explanation' => $studyVocabulary->explanation,
            'characters' => $characters,
            'examples' => $finder->find($word, $request->user()->id, 3),
        ]);
    }

    public function destroy(Request $request, StudyVocabulary $studyVocabulary)
    {
        abort_unless($request->user()->is_admin, 403);

        $studyVocabulary->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
