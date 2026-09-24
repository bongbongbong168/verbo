<?php

namespace App\Services;

use App\Models\MonthlyFeatureUsage;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

class UsageAllowanceService
{
    public const SCANS = 'scans';
    public const TRANSLATIONS = 'full_text_translations';
    public const AI_CHAT_MESSAGES = 'ai_chat_message';

    public function summary(User $user, string $feature): array
    {
        $this->assertFeature($feature);
        $periodStart = $this->periodStart($feature);
        $used = (int) MonthlyFeatureUsage::query()
            ->where('user_id', $user->id)
            ->where('feature', $feature)
            ->where('period_start', $periodStart)
            ->value('used');

        $limit = $this->limitFor($user, $feature);

        $resetsAt = $this->resetsAt($feature);

        return [
            'feature' => $feature,
            'used' => $used,
            'limit' => $limit,
            'remaining' => $limit === null ? null : max(0, $limit - $used),
            'period_type' => $this->featureConfig($feature)['period_type'],
            'period_start' => $periodStart,
            'resets_at' => $resetsAt->toIso8601String(),
            // Kept while the existing scan and translation screens migrate
            // to the richer timestamp field.
            'reset_date' => $resetsAt->toDateString(),
            'is_pro' => (bool) $user->is_pro,
            'available' => $limit === null || $used < $limit,
        ];
    }

    public function all(User $user): array
    {
        return [
            self::SCANS => $this->summary($user, self::SCANS),
            self::TRANSLATIONS => $this->summary($user, self::TRANSLATIONS),
            self::AI_CHAT_MESSAGES => $this->summary($user, self::AI_CHAT_MESSAGES),
        ];
    }

    /** Reserve before paid work so simultaneous requests cannot exceed the cap. */
    public function reserve(User $user, string $feature)
    {
        $limit = $this->limitFor($user, $feature);
        if ($limit === null) {
            return false;
        }

        $periodStart = $this->periodStart($feature);
        try {
            MonthlyFeatureUsage::query()->firstOrCreate([
                'user_id' => $user->id,
                'feature' => $feature,
                'period_start' => $periodStart,
            ]);
        } catch (QueryException $e) {
            // A concurrent first request may have inserted the unique row.
            if (! $this->isUniqueViolation($e)) {
                throw $e;
            }
        }

        $claimed = MonthlyFeatureUsage::query()
            ->where('user_id', $user->id)
            ->where('feature', $feature)
            ->where('period_start', $periodStart)
            ->whereRaw('(used + reserved) < ?', [$limit])
            ->increment('reserved');

        if (! $claimed) {
            $usage = $this->summary($user, $feature);
            throw new HttpResponseException(response()->json([
                'message' => $this->featureConfig($feature)['limit_message'],
                'code' => 'usage_limit_reached',
                'usage' => $usage,
            ], 429));
        }

        // Carry the period into commit/release. A request that crosses midnight
        // (or a month boundary) must settle the slot it originally reserved.
        return $periodStart;
    }

    public function commit(User $user, string $feature, $reservation): array
    {
        if ($reservation === false) {
            return $this->summary($user, $feature);
        }

        $this->changeReservation($user, $feature, $reservation, true);
        return $this->summary($user, $feature);
    }

    public function release(User $user, string $feature, $reservation): void
    {
        if ($reservation !== false) {
            $this->changeReservation($user, $feature, $reservation, false);
        }
    }

    private function changeReservation(User $user, string $feature, string $periodStart, bool $consume): void
    {
        DB::transaction(function () use ($user, $feature, $periodStart, $consume) {
            $usage = MonthlyFeatureUsage::query()
                ->where('user_id', $user->id)
                ->where('feature', $feature)
                ->where('period_start', $periodStart)
                ->lockForUpdate()
                ->firstOrFail();

            if ($usage->reserved < 1) {
                return;
            }

            $usage->reserved--;
            if ($consume) {
                $usage->used++;
            }
            $usage->save();
        });
    }

    private function limitFor(User $user, string $feature): ?int
    {
        $this->assertFeature($feature);
        if ($user->is_admin) {
            return null;
        }

        $config = $this->featureConfig($feature);

        return (int) $config[$user->is_pro ? 'pro' : 'free'];
    }

    private function assertFeature(string $feature): void
    {
        abort_unless(array_key_exists($feature, config('usage_allowances.features', [])), 404);
    }

    private function featureConfig(string $feature): array
    {
        $this->assertFeature($feature);

        return config("usage_allowances.features.{$feature}");
    }

    private function periodStart(string $feature): string
    {
        return $this->featureConfig($feature)['period_type'] === 'day'
            ? now()->startOfDay()->toDateString()
            : now()->startOfMonth()->toDateString();
    }

    private function resetsAt(string $feature)
    {
        return $this->featureConfig($feature)['period_type'] === 'day'
            ? now()->startOfDay()->addDay()
            : now()->startOfMonth()->addMonth();
    }

    private function isUniqueViolation(QueryException $e): bool
    {
        return in_array((string) ($e->errorInfo[0] ?? ''), ['23000', '23505'], true);
    }
}
