<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ChineseTranslationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class SentenceTranslationController extends Controller
{
    public function store(Request $request, ChineseTranslationService $translator)
    {
        $data = $request->validate([
            'text' => ['required', 'string', 'max:255'],
        ]);

        $text = trim($data['text']);
        abort_if($text === '', 422, 'Select a Chinese sentence first.');

        $cacheKey = 'sentence-translation:v1:'.hash('sha256', $text);
        if ($translation = Cache::get($cacheKey)) {
            return ['translation' => $translation];
        }

        try {
            $translation = $translator->translate([$text])[0];
        } catch (\RuntimeException $e) {
            abort(503, $e->getMessage());
        }
        Cache::put($cacheKey, $translation, now()->addDays(30));

        return ['translation' => $translation];
    }
}
