<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ChineseTranslationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class PodcastTranslationController extends Controller
{
    public function store(Request $request, ChineseTranslationService $translator)
    {
        abort_unless($request->user()->is_admin, 403);
        $data = $request->validate(['text' => ['required', 'string', 'max:60000']]);
        $text = trim($data['text']);
        abort_if($text === '', 422, 'Add the Chinese transcript before translating it.');

        /* A legacy episode used to send its whole Chinese transcript as one
           request. That produces one English paragraph, which cannot be
           paired with the individual Chinese sentences the reader shows.
           Translate the same sentence boundaries the reader uses, then save
           one English line per Chinese line. */
        $sentences = array_values(array_filter(
            preg_split('/(?<=[。！？!?])\s*/u', $text) ?: [],
            fn ($sentence) => trim($sentence) !== ''
        ));
        $sentences = $sentences ?: [$text];

        $cacheKey = 'podcast-translation:v2:'.hash('sha256', json_encode($sentences, JSON_UNESCAPED_UNICODE));
        if ($translations = Cache::get($cacheKey)) {
            return ['translation' => implode("\n", $translations), 'translations' => $translations];
        }
        try {
            $translations = [];
            foreach (array_chunk($sentences, 50) as $batch) {
                $translations = [...$translations, ...$translator->translate($batch)];
            }
        } catch (\RuntimeException $e) {
            abort(503, $e->getMessage());
        }
        Cache::put($cacheKey, $translations, now()->addDays(30));

        return ['translation' => implode("\n", $translations), 'translations' => $translations];
    }
}
