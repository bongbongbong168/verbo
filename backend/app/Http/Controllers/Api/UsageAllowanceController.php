<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\UsageAllowanceService;
use Illuminate\Http\Request;

class UsageAllowanceController extends Controller
{
    public function index(Request $request, UsageAllowanceService $allowances)
    {
        return response()->json(['usage' => $allowances->all($request->user())]);
    }
}
