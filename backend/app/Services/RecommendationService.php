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
 * "Recommended because…" needs. Points and reasons are produced together, so
 * the explanation can never claim something the score did not count.
 *
 * The reverse does NOT hold, and deliberately: a point can be scored without
 * adding a clause, where the clause would only repeat one already said. Liking
 * AND saving things with the same tag is one reason, not two, and a stated
 * format preference plus behaviour matching it is one fact said twice. Both
 * still count toward the score; neither says it again.
 *
 * WORDING IS PER TAG KIND, not one template. `article_tags` holds four kinds —
 * goal, focus, interest, style — and "about {value}" is right for a topic and
 * wrong for the rest. Flattening them produced "you saved other articles about
 * Articles", which is what a `style` tag looks like read as a subject.
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
            /* "you prefer Articles and you liked other articles in the same
               format" is one fact said twice — a stated preference and the
               behaviour matching it. The stated one is said first and wins; the
               similarity clause then stays silent about format while still
               scoring, exactly as the liked/saved pair already does. */
            $formatAlreadySaid = false;

            if ($prefs) {
                if ($prefs->hsk_level && $article->hsk_level === $prefs->hsk_level) {
                    $score += self::POINTS['hsk'];
                    $reasons[] = "it matches your {$prefs->hsk_level} level";
                }

                /* A clause per kind rather than one "it matches your {label} in
                   {value}" template. That template read acceptably for an
                   interest and badly for everything else — "it matches your
                   preferred format in Articles" is not a sentence anyone would
                   write. `%s` is the matched value; `style` names a format, so
                   it says what the reader prefers rather than what the piece is
                   "in". */
                foreach ([
                    'goal' => ['goals', 'it fits your %s goal'],
                    'focus' => ['focus', "you're working on %s"],
                    'interest' => ['interests', "you're interested in %s"],
                    'style' => ['styles', 'you prefer %s'],
                ] as $kind => [$prefField, $clause]) {
                    $hit = $this->firstOverlap($tags->get($kind), $prefs->{$prefField});
                    if ($hit !== null) {
                        $score += self::POINTS[$kind];
                        $reasons[] = sprintf($clause, $hit);
                        if ($kind === 'style') {
                            $formatAlreadySaid = true;
                        }
                    }
                }
            }

            $likedHit = $this->firstTagOverlap($article->tags, $likedTags);
            if ($likedHit !== null) {
                $score += self::POINTS['liked_similar'];
                if (! ($likedHit->kind === 'style' && $formatAlreadySaid)) {
                    $reasons[] = 'you liked other articles '.self::similarityPhrase($likedHit);
                    $formatAlreadySaid = $formatAlreadySaid || $likedHit->kind === 'style';
                }
            }

            $savedHit = $this->firstTagOverlap($article->tags, $bookmarkedTags);
            // Only said once — "liked AND saved similar" reads as padding. The
            // comparison is on kind AND value now, so a goal and an interest
            // that happen to share a word are still two different reasons.
            $sameAsLiked = $likedHit
                && $savedHit
                && $likedHit->kind === $savedHit->kind
                && $likedHit->value === $savedHit->value;

            if ($savedHit !== null && ! $sameAsLiked) {
                $score += self::POINTS['bookmarked_similar'];
                if (! ($savedHit->kind === 'style' && $formatAlreadySaid)) {
                    $reasons[] = 'you saved other articles '.self::similarityPhrase($savedHit);
                }
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

    /**
     * Every tag attached to a set of articles, as "kind|value".
     *
     * The KIND has to travel with the value. Matching on the value alone let a
     * `style` tag satisfy a comparison that was then described as a topic —
     * "you saved other articles about Articles", which is what this reads like
     * when the four kinds are flattened into one bag. Two kinds can also share
     * a value ("Travel" is both a goal and an interest here), and those are not
     * the same fact about a reader.
     */
    private function tagsOfEngaged($articleIds)
    {
        if ($articleIds->isEmpty()) {
            return collect();
        }

        return ArticleTag::whereIn('article_id', $articleIds)
            ->get(['kind', 'value'])
            ->map(fn (ArticleTag $t) => $t->kind.'|'.$t->value)
            ->unique();
    }

    /** The first of an article's tags that also appears in an engaged set. */
    private function firstTagOverlap($articleTags, $engaged): ?ArticleTag
    {
        if ($engaged->isEmpty()) {
            return null;
        }

        foreach ($articleTags as $tag) {
            if ($engaged->contains($tag->kind.'|'.$tag->value)) {
                return $tag;
            }
        }

        return null;
    }

    /**
     * How to finish "you liked other articles …" for a given tag kind.
     *
     * One template for all four kinds is what produced the nonsense: "about" is
     * right for a topic and wrong for everything else. A `style` tag is a
     * FORMAT preference, so it names no subject at all and the clause has to
     * avoid quoting its value — "other articles about Articles" says nothing.
     */
    private static function similarityPhrase(ArticleTag $tag): string
    {
        switch ($tag->kind) {
            case 'interest':
                return "about {$tag->value}";
            case 'focus':
                return "on {$tag->value}";
            case 'goal':
                return "for {$tag->value}";
            case 'style':
                return 'in the same format';
            default:
                return "about {$tag->value}";
        }
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
