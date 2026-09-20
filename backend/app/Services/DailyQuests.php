<?php

namespace App\Services;

use App\Models\DailyQuest;
use App\Models\Flashcard;
use App\Models\PodcastListenDay;
use App\Models\StudyUnitCompletion;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The day's three quests: one input, one vocabulary, one active practice.
 *
 * WHAT IS STORED IS THE CHOICE, NOT THE PROGRESS. Which quest fills each
 * area today, at which difficulty, lives in `daily_quests` because it cannot
 * be recomputed; every count below is still derived from rows the app writes
 * for its own reasons, the rule the plan card was built on.
 *
 * EVERY QUEST HERE IS SOMETHING VERBO CAN HONESTLY COUNT. Speaking and
 * writing quests were asked for and are deliberately absent: nothing records
 * a spoken answer (the assistant's mic is the browser's own, and nothing is
 * kept) and there is no writing feature at all, so those targets could only
 * be guessed at. A quest that cannot be measured is a checkbox the learner
 * ticks by deciding they did it, which is the opposite of the point.
 *
 * THE LEARNER STEERS, THE APP KEEPS THE STRUCTURE. A quest can be swapped
 * for another IN THE SAME AREA and its target moved between three fixed
 * levels - so a day is always one of each kind, and "read 0.5 articles"
 * cannot be expressed. Swaps are capped per area per day (MAX_CHANGES), or
 * the picker becomes a way to shop for whichever quest is already finished.
 */
class DailyQuests
{
    public const AREAS = ['input', 'vocabulary', 'practice'];

    public const LEVELS = ['easy', 'normal', 'hard'];

    /** Swaps allowed per area per day. */
    public const MAX_CHANGES = 2;

    /**
     * key => [area, verb (one line, {n} is the target), unit, mark, levels].
     *
     * `mark` names a glyph the client already draws; nothing here carries a
     * colour or an emoji, so the card stays the app's own.
     */
    public const QUESTS = [
        'read_article' => [
            'area' => 'input',
            'label' => 'Read {n} article|Read {n} articles',
            'unit' => 'articles',
            'mark' => 'book',
            'levels' => ['easy' => 1, 'normal' => 3, 'hard' => 5],
            'blurb' => 'Open and read a Chinese article',
        ],
        'read_story' => [
            'area' => 'input',
            'label' => 'Read {n} story|Read {n} stories',
            'unit' => 'stories',
            'mark' => 'book',
            'levels' => ['easy' => 1, 'normal' => 2, 'hard' => 3],
            'blurb' => 'Read something written as a story',
        ],
        'listen_podcast' => [
            'area' => 'input',
            // "min", not "minutes": the card's label column is ~133px, and
            // this is the same shortening `pace_label` already uses.
            'label' => 'Listen {n} min|Listen {n} min',
            'unit' => 'minutes',
            'mark' => 'headphones',
            'levels' => ['easy' => 3, 'normal' => 5, 'hard' => 10],
            'blurb' => 'Listen to a podcast episode',
        ],
        'review_words' => [
            'area' => 'vocabulary',
            'label' => 'Review {n} word|Review {n} words',
            'unit' => 'words',
            'mark' => 'refresh',
            'levels' => ['easy' => 5, 'normal' => 10, 'hard' => 20],
            'blurb' => 'Practise words already in your bank',
        ],
        'learn_words' => [
            'area' => 'vocabulary',
            'label' => 'Learn {n} new word|Learn {n} new words',
            'unit' => 'words',
            'mark' => 'sparkle',
            'levels' => ['easy' => 3, 'normal' => 5, 'hard' => 10],
            'blurb' => 'Answer a word right for the first time',
        ],
        'finish_lesson' => [
            'area' => 'practice',
            'label' => 'Finish {n} lesson|Finish {n} lessons',
            'unit' => 'lessons',
            'mark' => 'check',
            'levels' => ['easy' => 1, 'normal' => 2, 'hard' => 3],
            'blurb' => 'Work through a study lesson or its quiz',
        ],
        'scan_text' => [
            'area' => 'practice',
            'label' => 'Scan {n} photo|Scan {n} photos',
            'unit' => 'photos',
            'mark' => 'camera',
            'levels' => ['easy' => 1, 'normal' => 2, 'hard' => 3],
            'blurb' => 'Read Chinese you meet in the real world',
        ],
    ];

    /**
     * Which quest each area starts the day on, and why.
     *
     * Keyed off the learner's own stated focus and content preferences, so
     * the card can say WHY it is there rather than looking random - the
     * point of the "Why am I seeing this?" line. The fallback is the first
     * quest in the area, never a random pick: a quest that changes on every
     * page load cannot be planned around.
     */
    private const PREFERENCE_MATCHES = [
        'read_article' => ['focus' => ['Reading'], 'content' => ['Articles']],
        'read_story' => ['focus' => ['Reading'], 'content' => ['Stories']],
        'listen_podcast' => ['focus' => ['Listening'], 'content' => ['Podcasts']],
        'review_words' => ['focus' => ['Vocabulary'], 'content' => ['Flashcards']],
        'learn_words' => ['focus' => ['Vocabulary'], 'content' => ['Flashcards']],
        'finish_lesson' => ['focus' => ['Grammar'], 'content' => ['Quizzes']],
        'scan_text' => ['focus' => ['Reading'], 'content' => []],
    ];

    /** Today's three, created on first read of the day. */
    public function forToday($user): array
    {
        $day = Carbon::today()->toDateString();
        $rows = DailyQuest::where('user_id', $user->id)->where('day', $day)->get()->keyBy('area');

        $out = [];
        foreach (self::AREAS as $area) {
            $row = $rows->get($area) ?? DailyQuest::create([
                'user_id' => $user->id,
                'day' => $day,
                'area' => $area,
                'quest_key' => $this->pick($user, $area),
                'level' => 'normal',
            ]);

            $out[] = $this->describe($user, $row);
        }

        return $out;
    }

    /** One quest, with its progress and everything the card renders. */
    public function describe($user, DailyQuest $row): array
    {
        $quest = self::QUESTS[$row->quest_key];
        $target = $quest['levels'][$row->level];
        $progress = $this->progress($user, $row->quest_key);

        return [
            'id' => $row->id,
            'area' => $row->area,
            'key' => $row->quest_key,
            'mark' => $quest['mark'],
            'label' => $this->label($row->quest_key, $target),
            'unit' => $quest['unit'],
            'level' => $row->level,
            'target' => $target,
            // Clamped: 40 words reviewed has done the quest, and 40/10 reads
            // as a broken widget.
            'progress' => min($progress, $target),
            'done' => $progress >= $target,
            'changes_left' => max(0, self::MAX_CHANGES - $row->changes_used),
            'why' => $this->why($user, $row->quest_key),
        ];
    }

    public function label(string $key, int $target): string
    {
        [$one, $many] = explode('|', self::QUESTS[$key]['label']);

        return str_replace('{n}', (string) $target, $target === 1 ? $one : $many);
    }

    /** The other quests in this area, for the change sheet. */
    public function alternatives(string $area, string $exclude): array
    {
        $out = [];
        foreach (self::QUESTS as $key => $quest) {
            if ($quest['area'] !== $area || $key === $exclude) {
                continue;
            }
            $out[] = [
                'key' => $key,
                'mark' => $quest['mark'],
                'label' => $this->label($key, $quest['levels']['normal']),
                'blurb' => $quest['blurb'],
            ];
        }

        return $out;
    }

    /**
     * How much of this quest is done today. Every count is of rows the app
     * writes anyway, and each counts THINGS rather than actions: distinct
     * articles, distinct words - so nothing can be farmed by repeating one.
     */
    public function progress($user, string $key): int
    {
        $since = Carbon::today();

        switch ($key) {
            case 'read_article':
                return DB::table('article_views')
                    ->where('user_id', $user->id)
                    ->where('last_viewed_at', '>=', $since)
                    ->count();

            case 'read_story':
                return DB::table('article_views')
                    ->join('articles', 'articles.id', '=', 'article_views.article_id')
                    ->where('article_views.user_id', $user->id)
                    ->where('article_views.last_viewed_at', '>=', $since)
                    ->where('articles.type', 'story')
                    ->count();

            case 'listen_podcast':
                // Whole minutes: 4m59s of a 5-minute quest is not done.
                return intdiv(PodcastListenDay::secondsToday($user->id), 60);

            case 'review_words':
                return Flashcard::where('user_id', $user->id)
                    ->where('last_reviewed_at', '>=', $since)
                    ->count();

            case 'learn_words':
                return Flashcard::where('user_id', $user->id)
                    ->where('first_correct_at', '>=', $since)
                    ->count();

            case 'finish_lesson':
                return StudyUnitCompletion::where('user_id', $user->id)
                    ->where('completed_at', '>=', $since)
                    ->count();

            case 'scan_text':
                return DB::table('scans')
                    ->where('user_id', $user->id)
                    ->where('created_at', '>=', $since)
                    ->count();
        }

        return 0;
    }

    /** The quest this area opens on, from the learner's own answers. */
    private function pick($user, string $area): string
    {
        $prefs = $user->learningPreference;
        $focus = (array) ($prefs->focus ?? []);
        $content = (array) ($prefs->styles ?? []);

        foreach (self::QUESTS as $key => $quest) {
            if ($quest['area'] !== $area) {
                continue;
            }
            $match = self::PREFERENCE_MATCHES[$key];
            if (array_intersect($focus, $match['focus']) || array_intersect($content, $match['content'])) {
                return $key;
            }
        }

        foreach (self::QUESTS as $key => $quest) {
            if ($quest['area'] === $area) {
                return $key;
            }
        }

        return 'read_article';
    }

    /**
     * "Why am I seeing this?" - the recommendation said out loud. It names
     * the answer it came from, or says plainly that it is the app's default,
     * rather than implying a personalisation that did not happen.
     */
    private function why($user, string $key): string
    {
        $prefs = $user->learningPreference;
        $match = self::PREFERENCE_MATCHES[$key];
        $focus = array_intersect((array) ($prefs->focus ?? []), $match['focus']);
        $content = array_intersect((array) ($prefs->styles ?? []), $match['content']);

        if ($focus) {
            return 'You chose '.strtolower(reset($focus)).' as something to work on, so Verbo put it in today.';
        }
        if ($content) {
            return 'You said you like learning from '.strtolower(reset($content)).', so Verbo picked this one.';
        }

        return 'Verbo picks one quest from each area. Change it, or set your goals in Settings.';
    }
}
