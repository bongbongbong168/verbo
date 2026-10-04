<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\PaywayTransaction;
use App\Models\TutorLesson;
use App\Models\TutorProfile;
use App\Models\User;
use App\Services\PaywayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PaywayTest extends TestCase
{
    use RefreshDatabase;

    private User $student;
    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.payway.merchant_id' => 'ec000000',
            'services.payway.api_key' => 'test-key',
            'services.payway.sandbox' => true,
        ]);
        // ABA's KHQR purchase answer, as the sandbox really returns it.
        Http::fake(['*payments/purchase' => Http::response([
            'qrString' => '000201...',
            'qrImage' => 'data:image/png;base64,iVBORw0KGgo=',
            'abapay_deeplink' => 'abamobilebank://ababank.com?type=payway',
            'status' => ['code' => '00', 'message' => 'Success!'],
        ])]);

        $tutor = User::factory()->create();
        $profile = new TutorProfile(['bio' => 'x']);
        $profile->user_id = $tutor->id;
        $profile->save();
        $profile->forceFill(['status' => 'approved'])->save();
        $lesson = $profile->lessons()->create(['name' => 'Trial', 'price' => 12, 'duration_minutes' => 30]);

        $this->student = User::factory()->create(['name' => 'Sok Dara']);
        $this->booking = new Booking([
            'status' => 'held',
            'starts_at' => now()->addDays(2),
            'hold_expires_at' => now()->addMinutes(15),
            'tutor_lesson_id' => $lesson->id,
            'duration_minutes' => 30,
        ]);
        $this->booking->student_id = $this->student->id;
        $this->booking->tutor_id = $tutor->id;
        $this->booking->save();
    }

    private function checkoutTran(): string
    {
        return $this->actingAs($this->student)
            ->postJson('/api/payway/checkout', ['kind' => 'lesson', 'id' => $this->booking->id])
            ->assertOk()
            ->json('tran_id');
    }

    public function test_checkout_returns_the_khqr_and_signs_abas_fields_with_the_servers_price(): void
    {
        $res = $this->actingAs($this->student)
            ->postJson('/api/payway/checkout', ['kind' => 'lesson', 'id' => $this->booking->id, 'amount' => 0.01])
            ->assertOk()
            ->assertJsonPath('amount', '12.00')
            ->assertJsonPath('qr_image', 'data:image/png;base64,iVBORw0KGgo=');
        $this->assertArrayNotHasKey('hash', $res->json()); // signing stays server-side

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase')) {
                return false;
            }
            $f = collect($request->data())->mapWithKeys(fn ($p) => [$p['name'] => $p['contents']])->all();
            $source = '';
            foreach (PaywayService::PURCHASE_HASH_ORDER as $k) {
                $source .= $f[$k] ?? '';
            }

            return $f['amount'] === '12.00'
                && $f['payment_option'] === 'abapay_khqr'
                && strlen($f['tran_id']) <= 20
                && $f['hash'] === base64_encode(hash_hmac('sha512', $source, 'test-key', true));
        });
    }

    public function test_an_approved_payment_settles_the_booking_once_aba_confirms_it(): void
    {
        $tran = $this->checkoutTran();
        Http::fake(['*check-transaction-2' => Http::response([
            'data' => ['payment_status_code' => 0, 'payment_amount' => 12, 'apv' => '123456'],
            'status' => ['code' => '00', 'tran_id' => $tran],
        ])]);

        // ABA's ping carries nothing we trust; it only prompts the check.
        $this->postJson('/api/payway/callback', ['tran_id' => $tran])->assertOk();

        $this->assertSame('paid', PaywayTransaction::where('tran_id', $tran)->value('status'));
        $this->assertSame('pending', $this->booking->fresh()->status); // a paid request awaiting the tutor
    }

    public function test_a_ping_for_an_unpaid_transaction_changes_nothing(): void
    {
        $tran = $this->checkoutTran();
        Http::fake(['*check-transaction-2' => Http::response([
            'data' => ['payment_status_code' => 2, 'payment_amount' => 0],
            'status' => ['code' => '00'],
        ])]);

        $this->postJson('/api/payway/callback', ['tran_id' => $tran])->assertOk();

        $this->assertSame('pending', PaywayTransaction::where('tran_id', $tran)->value('status'));
        $this->assertSame('held', $this->booking->fresh()->status);
    }

    public function test_a_short_payment_is_never_handed_over(): void
    {
        $tran = $this->checkoutTran();
        Http::fake(['*check-transaction-2' => Http::response([
            'data' => ['payment_status_code' => 0, 'payment_amount' => 1],
            'status' => ['code' => '00'],
        ])]);

        $this->actingAs($this->student)->getJson("/api/payway/status/{$tran}")->assertOk()->assertJsonPath('status', 'pending');
        $this->assertSame('held', $this->booking->fresh()->status);
    }

    public function test_someone_elses_transaction_is_not_visible(): void
    {
        $tran = $this->checkoutTran();
        $this->actingAs(User::factory()->create())->getJson("/api/payway/status/{$tran}")->assertNotFound();
    }

    public function test_it_is_off_without_keys(): void
    {
        config(['services.payway.api_key' => null]);
        $this->actingAs($this->student)
            ->postJson('/api/payway/checkout', ['kind' => 'lesson', 'id' => $this->booking->id])
            ->assertStatus(422);
        $this->getJson('/api/payments/config')->assertJsonPath('payway_enabled', false);
    }
}
