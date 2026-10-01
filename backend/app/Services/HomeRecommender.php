<?php

namespace App\Services;

use App\Models\LearningPreference;
use App\Models\TutorAvailability;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Orders tutors and podcasts for the Home page from the learner's own
 * learning preferences, the way RecommendationService orders articles.
 *
 * Rule-based and self-explaining: each point is scored together with the
 * reason for it, so the "why" line can never claim something the score did
 * not count. With no preferences saved, nothing is scored and the list keeps
 * its normal order (newest / best rated), so a new learner still sees a full
 * row rather than an empty one.
 */
class HomeRecommender
{
    /** Preference answers -> tutor specialty keys (TutorProfile::SPECIALTIES). */
    private const GOAL_SPECIALTIES = [
        'Speaking & Conversation' => ['conversational', 'speaking'],
        'HSK / Exam Preparation' => ['hsk', 'exam'],
        'Business Chinese' => ['business'],
        'Travel' => ['travel'],
        'Everyday Chinese' => ['everyday', 'conversational'],
    ];

    private const FOCUS_SPECIALTIES = [
        'Speaking' => ['speaking', 'conversational'],
        'Pronunciation' => ['pronunciation'],
        'Grammar' => ['grammar'],
    ];

    /** The learner's level in the words tutors and podcasts use. */
    public static function band(?LearningPreference $p): ?string
    {
        return match ($p?->chinese_level) {
            'Complete Beginner', 'Beginner' => 'Beginner',
            'Intermediate' => 'Intermediate',
            'Advanced' => 'Advanced',
            default => null,
        };
    }

    /* "When do you usually study?" as hours of the LEARNER's day. */
    private const STUDY_BANDS = [
        'Morning' => [6, 12],
        'Afternoon' => [12, 18],
        'Evening' => [18, 23],
    ];

    /**
     * Tutors with at least 30 minutes of weekly hours inside the learner's
     * study time, keyed by profile id. Tutor hours are wall-clock in the
     * TUTOR's timezone, so each opening is converted to the learner's zone
     * first: a tutor's 9pm in Shanghai is the afternoon in Europe. One query
     * for every tutor's hours, not one per card.
     */
    private function tutorsFreeAt(Collection $tutors, string $studyTime, string $learnerTz): array
    {
        [$from, $to] = self::STUDY_BANDS[$studyTime];
        $zones = $tutors->mapWithKeys(fn ($t) => [$t->id => $t->timezone ?: 'UTC']);
        $rows = TutorAvailability::whereIn('tutor_profile_id', $zones->keys())->get();

        $free = [];
        foreach ($rows as $row) {
            $tz = $zones[$row->tutor_profile_id] ?? 'UTC';
            try {
                $day = Carbon::now($tz)->startOfWeek(Carbon::SUNDAY)->addDays((int) $row->day_of_week);
                [$sh, $sm] = array_map('intval', explode(':', $row->start_time));
                [$eh, $em] = array_map('intval', explode(':', $row->end_time));
                $start = $day->copy()->setTime($sh, $sm)->setTimezone($learnerTz);
                $end = $day->copy()->setTime($eh, $em)->setTimezone($learnerTz);
            } catch (\Throwable) {
                continue;
            }
            // Overlap with the band on the learner's own calendar day(s).
            for ($d = $start->copy()->startOfDay(); $d <= $end; $d->addDay()) {
                $bandStart = $d->copy()->setTime($from, 0);
                $bandEnd = $d->copy()->setTime($to, 0);
                $overlap = min($end->timestamp, $bandEnd->timestamp) - max($start->timestamp, $bandStart->timestamp);
                if ($overlap >= 30 * 60) {
                    $free[$row->tutor_profile_id] = true;
                    break;
                }
            }
        }

        return $free;
    }

    public function tutors(Collection $tutors, ?LearningPreference $p, ?string $learnerTz = null): Collection
    {
        if (! $p) return $tutors->values();

        $studyTime = isset(self::STUDY_BANDS[$p->study_time]) ? $p->study_time : null;
        $tz = $learnerTz && in_array($learnerTz, timezone_identifiers_list(), true) ? $learnerTz : config('app.timezone');
        $freeAt = $studyTime ? $this->tutorsFreeAt($tutors, $studyTime, $tz) : [];

        $band = self::band($p);
        $wanted = [];
        foreach ((array) $p->goals as $g) foreach (self::GOAL_SPECIALTIES[$g] ?? [] as $k) $wanted[$k] = true;
        foreach ((array) $p->focus as $f) foreach (self::FOCUS_SPECIALTIES[$f] ?? [] as $k) $wanted[$k] = true;
        if ($p->hsk_level) $wanted['hsk'] = true;
        if (in_array('Travel', (array) $p->interests, true)) $wanted['travel'] = true;
        if (in_array('Business', (array) $p->interests, true)) $wanted['business'] = true;

        return $tutors->map(function ($t, $i) use ($band, $wanted, $freeAt, $studyTime) {
            $score = 0;
            $why = [];
            $levels = (array) ($t->teaches_levels ?? []);
            if ($band && (in_array($band, $levels, true) || in_array('All levels', $levels, true))) {
                $score += 2;
                $why[] = 'teaches '.strtolower($band).' learners';
            }
            $matched = collect($t->specialty_list ?? [])->filter(fn ($s) => isset($wanted[$s['key'] ?? '']));
            if ($matched->isNotEmpty()) {
                $score += 3 * $matched->count();
                $why[] = 'specialises in '.$matched->pluck('label')->unique()->take(2)->implode(' and ');
            }
            // Bookable when the learner actually studies.
            if ($studyTime && isset($freeAt[$t->id])) {
                $score += 2;
                $why[] = 'has '.strtolower($studyTime).' openings';
            }
            $t->setAttribute('match_score', $score);
            $t->setAttribute('match_why', $why ? ucfirst(implode(', ', $why)) : null);
            $t->setAttribute('_order', $i);

            return $t;
        })
            // Best match first; ties keep the normal order, rating then newest.
            ->sortBy([
                fn ($a, $b) => $b->match_score <=> $a->match_score,
                fn ($a, $b) => ($b->reviews_avg_rating ?? 0) <=> ($a->reviews_avg_rating ?? 0),
                fn ($a, $b) => $a->_order <=> $b->_order,
            ])
            ->each(fn ($t) => $t->offsetUnset('_order'))
            ->values();
    }

    public function podcasts(Collection $podcasts, ?LearningPreference $p): Collection
    {
        if (! $p) return $podcasts->values();

        $band = self::band($p);
        $interests = array_map('mb_strtolower', (array) $p->interests);

        return $podcasts->map(function ($pod, $i) use ($band, $interests) {
            $score = 0;
            $why = [];
            if ($band && $pod->level === $band) {
                $score += 3;
                $why[] = 'at your level';
            }
            // An interest named in the episode's topic, title or blurb.
            $hay = mb_strtolower(implode(' ', [$pod->category, $pod->title, $pod->bio]));
            foreach ($interests as $interest) {
                if ($interest !== '' && str_contains($hay, $interest)) {
                    $score += 2;
                    $why[] = 'about '.$interest;
                    break;
                }
            }
            $pod->setAttribute('match_score', $score);
            $pod->setAttribute('match_why', $why ? ucfirst(implode(', ', $why)) : null);
            $pod->setAttribute('_order', $i);

            return $pod;
        })
            ->sortBy([
                fn ($a, $b) => $b->match_score <=> $a->match_score,
                fn ($a, $b) => $a->_order <=> $b->_order,
            ])
            ->each(fn ($p) => $p->offsetUnset('_order'))
            ->values();
    }
}
