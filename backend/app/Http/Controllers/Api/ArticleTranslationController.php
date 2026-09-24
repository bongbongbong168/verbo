<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Services\ChineseTranslationService;
use App\Services\UsageAllowanceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class ArticleTranslationController extends Controller
{
    public function store(Request $request, Article $article, ChineseTranslationService $translator, UsageAllowanceService $allowances)
    {
        abort_if(
            $article->is_premium && ! $request->user()->is_pro && ! $request->user()->is_admin,
            403,
            'Upgrade to Verbo Pro to translate the full article.'
        );

        $text = trim((string) $article->body);
        abort_if($text === '', 422, 'There is no text to translate.');
        abort_if(strlen($text) > 60000, 422, 'This article is too long to translate.');

        $sentences = $this->sentences($text);
        $cacheKey = 'article-translation:v1:'.$article->id.':'.hash('sha256', $text);
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

    /** Keep the punctuation with the Chinese sentence displayed above it. */
    private function sentences(string $text): array
    {
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
