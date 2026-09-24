<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Services\SubscriptionService;
use Illuminate\Http\Request;
class SubscriptionController extends Controller {
    public function status(Request $r, SubscriptionService $s) { return $s->status($r->user()); }
    public function checkout(Request $r, SubscriptionService $s)
    {
        // Only the presentation is chosen by the client — never a price.
        $data = $r->validate(['ui' => ['nullable', 'in:'.implode(',', SubscriptionService::CHECKOUT_UIS)]]);
        return $s->checkout($r->user(), $data['ui'] ?? 'hosted');
    }
    public function portal(Request $r, SubscriptionService $s) { return $s->portal($r->user()); }
}
