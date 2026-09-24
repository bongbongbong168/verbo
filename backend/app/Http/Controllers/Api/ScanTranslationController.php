<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Scan;
use App\Services\ChineseTranslationService;
use App\Services\UsageAllowanceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class ScanTranslationController extends Controller
{
    public function store(Request $request, Scan $scan, ChineseTranslationService $translator, UsageAllowanceService $allowances)
    {
        abort_unless((int) $scan->user_id === (int) $request->user()->id, 403);
        $text = trim($scan->raw_text ?? '');
        abort_if($text === '', 422, 'There is no text to translate.');
        abort_if(strlen($text) > 60000, 422, 'This document is too long. Scan a smaller section to translate.');
        $sentences = $this->sentences($text);
        $cacheKey = 'scan-translation:v3:'.$scan->user_id.':'.$scan->id.':'.hash('sha256', $text);
        if ($pairs = Cache::get($cacheKey)) {
            return ['pairs' => $pairs, 'usage' => $allowances->summary($request->user(), UsageAllowanceService::TRANSLATIONS)];
        }

        $reservation = $allowances->reserve($request->user(), UsageAllowanceService::TRANSLATIONS);
        $consumed = false;
        try {
            $translations = $translator->translate($sentences);
            $pairs = collect($sentences)->values()->map(fn ($source, $index) => [
                'source' => $source,
                'translation' => $translations[$index],
            ])->all();
            Cache::put($cacheKey, $pairs, now()->addDays(30));
            $usage = $allowances->commit($request->user(), UsageAllowanceService::TRANSLATIONS, $reservation);
            $consumed = true;

            return ['pairs' => $pairs, 'usage' => $usage];
        } catch (\RuntimeException $e) {
            abort(503, $e->getMessage());
        } finally {
            if (! $consumed) {
                $allowances->release($request->user(), UsageAllowanceService::TRANSLATIONS, $reservation);
            }
        }
    }

    /** Keep punctuation on its sentence, including a closing quote after it. */
    private function sentences(string $text): array
    {
        // OCR usually separates a title from the story with a blank line.
        // That title needs its own translation, not to be glued to sentence 1.
        return collect(preg_split('/\R\s*\R/u', trim($text)))
            ->flatMap(function ($paragraph) {
                preg_match_all('/.*?(?:[。！？!?]+[”’）】〕》]*|$)/us', $paragraph, $matches);
                return $matches[0];
            })
            ->map(fn ($sentence) => trim($sentence))
            ->filter()
            ->values()
            ->all();
    }
}
