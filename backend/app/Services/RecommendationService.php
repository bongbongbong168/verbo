<?php

namespace App\Services;

use App\Models\Article;
use App\Models\ArticleBookmark;
use App\Models\ArticleLike;
use App\Models\ArticleTag;
use App\Models\ArticleView;
use App\Models\User;

/**
 * Rule-based article recommendations.
 *
 * Deliberately not machine learning: the whole thing is a handful of additions
 * whose result can be explained to the reader in one sentence, which is what
 * "Recommended because…" needs. Every point that is awarded also produces the
 * reason string, so the score and the explanation can never disagree.
 */
class RecommendationService
{
    /** The weights, in one place so the scoring and the docs cannot drift. */
    public const POINTS = [
        'hsk' => 2,
        'goal' => 3,
        'focus' => 2,
        'interest' => 2,
        'style' => 1,
        'liked_similar' => 2,
        'bookmarked_similar' => 2,
    ];

    /**
     * @return array<int, array{article: Article, score: int, reasons: array<int, string>}>
     */
    public function forUser(User $user, int $limit = 6, ?int $excludeArticleId = null): array
    {
        $prefs = $user->learningPreference;

        $articles = Article::query()
            ->with('tags')
            ->when($excludeArticleId, fn ($q) => $q->where('id', '!=', $excludeArticleId))
            ->get();

        if ($articles->isEmpty()) {
            return [];
        }

        // What the reader has already engaged with, as tag values — this is
        // what "similar to things you liked" is measured against.
        $likedTags = $this->tagsOfEngaged(ArticleLike::where('user_id', $user->id)->pluck('article_id'));
        $bookmarkedTags = $this->tagsOfEngaged(ArticleBookmark::where('user_id', $user->id)->pluck('article_id'));

        // Already-read articles are pushed down, not removed: re-reading is
        // legitimate, but it should not crowd out things they have not seen.
        $readIds = ArticleView::where('user_id', $user->id)->pluck('article_id')->flip();

        $scored = [];

        foreach ($articles as $article) {
            $tags = $article->tags->groupBy('kind')->map->pluck('value');
            $score = 0;
            $reasons = [];

            if ($prefs) {
                if ($prefs->hsk_level && $article->hsk_level === $prefs->hsk_level) {
                    $score += self::POINTS['hsk'];
                    $reasons[] = "it matches your {$prefs->hsk_level} level";
                }

                foreach ([
                    'goal' => ['goals', 'learning goal'],
                    'focus' => ['focus', 'learning focus'],
                    'interest' => ['interests', 'interests'],
                    'style' => ['styles', 'preferred format'],
                ] as $kind => [$prefField, $label]) {
                    $hit = $this->firstOverlap($tags->get($kind), $prefs->{$prefField});
                    if ($hit !== null) {
                        $score += self::POINTS[$kind];
                        $reasons[] = "it matches your {$label} in {$hit}";
                    }
                }
            }

            $likedHit = $this->firstOverlap($article->tags->pluck('value'), $likedTags);
            if ($likedHit !== null) {
                $score += self::POINTS['liked_similar'];
                $reasons[] = "you liked other articles about {$likedHit}";
            }

            $savedHit = $this->firstOverlap($article->tags->pluck('value'), $bookmarkedTags);
            // Only said once — "liked AND saved similar" reads as padding.
            if ($savedHit !== null && $savedHit !== $likedHit) {
                $score += self::POINTS['bookmarked_similar'];
                $reasons[] = "you saved other articles about {$savedHit}";
            } elseif ($savedHit !== null) {
                $score += self::POINTS['bookmarked_similar'];
            }

            $scored[] = [
                'article' => $article,
                'score' => $score,
                'reasons' => $reasons,
                'already_read' => $readIds->has($article->id),
            ];
        }

        usort($scored, function ($a, $b) {
            // Unread first at equal score, then newest — so a tie does not
            // order itself by database id, which looks arbitrary.
            if ($a['score'] !== $b['score']) {
                return $b['score'] <=> $a['score'];
            }
            if ($a['already_read'] !== $b['already_read']) {
                return $a['already_read'] <=> $b['already_read'];
            }

            return $b['article']->id <=> $a['article']->id;
        });

        return array_slice($scored, 0, $limit);
    }

    /**
     * One sentence a reader can actually understand, or a plain fallback when
     * nothing matched — "Recommended because" with no because is worse than
     * saying nothing specific.
     */
    public static function explain(array $reasons): string
    {
        if (empty($reasons)) {
            return 'Popular with other learners';
        }

        // Two reasons is the most that still reads as a sentence.
        $take = array_slice($reasons, 0, 2);

        return 'Recommended because '.implode(' and ', $take);
    }

    /** Every tag value attached to a set of articles. */
    private function tagsOfEngaged($articleIds)
    {
        if ($articleIds->isEmpty()) {
            return collect();
        }

        return ArticleTag::whereIn('article_id', $articleIds)->pluck('value')->unique();
    }

    /** The first value present in both lists, or null. */
    private function firstOverlap($a, $b): ?string
    {
        if (! $a || ! $b) {
            return null;
        }

        $bSet = collect($b)->filter()->values();

        foreach (collect($a) as $value) {
            if ($bSet->contains($value)) {
                return $value;
            }
        }

        return null;
    }
}
