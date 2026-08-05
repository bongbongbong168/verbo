<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Quote;
use Illuminate\Http\Request;

class QuoteController extends Controller
{
    public function show()
    {
        return Quote::first();
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'chinese' => ['nullable', 'string', 'max:255'],
            'pinyin' => ['nullable', 'string', 'max:255'],
            'english' => ['nullable', 'string', 'max:255'],
        ]);

        $quote = Quote::first();

        if ($quote) {
            $quote->update($data);
        } else {
            $quote = Quote::create($data);
        }

        return response()->json($quote);
    }
}
