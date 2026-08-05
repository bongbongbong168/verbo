<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function index(Request $request)
    {
        return [
            'sent' => $request->user()->bookingsAsStudent()->with('tutor:id,name,email')->latest()->get(),
            'received' => $request->user()->bookingsAsTutor()->with('student:id,name,email')->latest()->get(),
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'tutor_id' => ['required', 'integer', 'exists:users,id'],
            'message' => ['nullable', 'string'],
        ]);

        if ((int) $data['tutor_id'] === $request->user()->id) {
            return response()->json(['message' => 'You cannot book yourself.'], 422);
        }

        $data['status'] = 'pending';

        $booking = $request->user()->bookingsAsStudent()->create($data);

        return response()->json($booking->load('tutor:id,name,email'), 201);
    }
}
