<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    /**
     * Change the display name.
     *
     * Email is deliberately not editable here: changing it would need a
     * verification round-trip to prove the new address belongs to the user,
     * and there is no mail sending in this app. The Settings page shows it
     * read-only and says so, rather than offering a change that would quietly
     * lock someone out of their own login.
     */
    public function update(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $request->user()->update($data);

        return response()->json($request->user()->fresh());
    }

    /**
     * Change the password.
     *
     * The current password is required even though the caller already holds a
     * valid token — a token can be left behind on a shared machine, and this is
     * the one action that would let whoever found it take the account.
     *
     * Every other token is revoked on success, so anyone signed in with the old
     * password is kicked out. The caller's own token is spared, or changing
     * your password would sign you out of the tab you did it in.
     */
    public function updatePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['That is not your current password.'],
            ]);
        }

        $user->update(['password' => Hash::make($data['password'])]);

        $user->tokens()->where('id', '!=', $request->user()->currentAccessToken()->id)->delete();

        return response()->json(['message' => 'Password updated']);
    }

    /**
     * Sign out everywhere else — revokes every token but the one making the
     * request. The count is returned so the UI can say what actually happened
     * rather than claiming success on a no-op.
     */
    public function revokeOtherSessions(Request $request)
    {
        $revoked = $request->user()->tokens()
            ->where('id', '!=', $request->user()->currentAccessToken()->id)
            ->delete();

        return response()->json(['revoked' => $revoked]);
    }

    /**
     * Counts for the Settings page's "your data" summary. Cheap COUNT queries
     * rather than loading the rows.
     */
    public function stats(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'flashcards' => $user->flashcards()->count(),
            'scans' => $user->scans()->count(),
            'units_opened' => $user->studyProgress()->count(),
            'other_sessions' => $user->tokens()
                ->where('id', '!=', $request->user()->currentAccessToken()->id)
                ->count(),
            'member_since' => $user->created_at,
        ]);
    }
}
