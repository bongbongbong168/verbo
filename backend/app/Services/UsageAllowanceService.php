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

    private const LIMITS = [
        self::SCANS => ['free' => 5, 'pro' => 100],
        self::TRANSLATIONS => ['free' => 10, 'pro' => 300],
    ];

    public function summary(User $user, string $feature): array
    {
        $this->assertFeature($feature);
        $periodStart = now()->startOfMonth()->toDateString();
        $used = (int) MonthlyFeatureUsage::query()
            ->where('user_id', $user->id)
            ->where('feature', $feature)
            ->where('period_start', $periodStart)
            ->value('used');

        $limit = $this->limitFor($user, $feature);

        return [
            'feature' => $feature,
            'used' => $used,
            'limit' => $limit,
            'remaining' => $limit === null ? null : max(0, $limit - $used),
            'period_start' => $periodStart,
            'reset_date' => now()->startOfMonth()->addMonth()->toDateString(),
            'is_pro' => (bool) $user->is_pro,
            'available' => $limit === null || $used < $limit,
        ];
    }

    public function all(User $user): array
    {
        return [
            self::SCANS => $this->summary($user, self::SCANS),
            self::TRANSLATIONS => $this->summary($user, self::TRANSLATIONS),
        ];
    }

    /** Reserve before paid work so simultaneous requests cannot exceed the cap. */
    public function reserve(User $user, string $feature): bool
    {
        $limit = $this->limitFor($user, $feature);
        if ($limit === null) {
            return false;
        }

        $periodStart = now()->startOfMonth()->toDateString();
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
                'message' => $feature === self::SCANS
                    ? 'You have used all of this month\'s scans.'
                    : 'You have used all of this month\'s translations.',
                'code' => 'usage_limit_reached',
                'usage' => $usage,
            ], 429));
        }

        return true;
    }

    public function commit(User $user, string $feature, bool $reserved): array
    {
        if (! $reserved) {
            return $this->summary($user, $feature);
        }

        $this->changeReservation($user, $feature, true);
        return $this->summary($user, $feature);
    }

    public function release(User $user, string $feature, bool $reserved): void
    {
        if ($reserved) {
            $this->changeReservation($user, $feature, false);
        }
    }

    private function changeReservation(User $user, string $feature, bool $consume): void
    {
        DB::transaction(function () use ($user, $feature, $consume) {
            $usage = MonthlyFeatureUsage::query()
                ->where('user_id', $user->id)
                ->where('feature', $feature)
                ->where('period_start', now()->startOfMonth()->toDateString())
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

        return self::LIMITS[$feature][$user->is_pro ? 'pro' : 'free'];
    }

    private function assertFeature(string $feature): void
    {
        abort_unless(array_key_exists($feature, self::LIMITS), 404);
    }

    private function isUniqueViolation(QueryException $e): bool
    {
        return in_array((string) ($e->errorInfo[0] ?? ''), ['23000', '23505'], true);
    }
}
