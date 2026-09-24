<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Services\SubscriptionService;
use Illuminate\Http\Request;
class SubscriptionController extends Controller {
    public function status(Request $r, SubscriptionService $s) { return $s->status($r->user()); }
    public function checkout(Request $r, SubscriptionService $s) { return $s->checkout($r->user()); }
    public function portal(Request $r, SubscriptionService $s) { return $s->portal($r->user()); }
}
