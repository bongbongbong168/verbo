<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailCode;
use App\Models\User;
use App\Services\EmailCodeService;
use App\Services\GoogleAuthService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Sign in (or sign up) with Google.
     *
     * The browser gets an ID token from Google Identity Services and posts it
     * here; GoogleAuthService checks the signature, audience, issuer and that
     * the address is verified. Everything past that point trusts the email.
     *
     * One endpoint for both sign-in and sign-up on purpose. Google does not
     * tell the browser whether this person has been here before, and asking
     * the user to pick the right button for a fact they cannot know is how you
     * get "email already registered" errors on a sign-in attempt.
     */
    public function google(Request $request, GoogleAuthService $google)
    {
        $data = $request->validate([
            'credential' => ['required', 'string'],
        ]);

        abort_unless(GoogleAuthService::configured(), 503, 'Google sign-in is not configured.');

        $claims = $google->verify($data['credential']);

        if (! $claims) {
            // Deliberately vague: a caller probing this endpoint learns only
            // that the token was not good enough, never which check failed.
            return response()->json(['message' => 'Could not verify that Google sign-in.'], 401);
        }

        $user = $this->userFromGoogle($claims);

        $token = $user->createToken('verbo')->plainTextToken;

        /* 201 when this created the account, 200 when it signed one in. The
           client uses it for nothing today — both land on the same place, and
           onboarding is gated on `onboarded_at`, not on this — but a caller
           should still be told which of the two things happened. */
        $created = $user->wasRecentlyCreated;

        return response()->json(['user' => $user, 'token' => $token], $created ? 201 : 200);
    }

    /** Find, link or create the account a verified Google identity belongs to. */
    private function userFromGoogle(array $claims): User
    {
        return DB::transaction(function () use ($claims) {
            // Match on google_id FIRST. It is the stable identifier — a Google
            // account can change its email address, and following the id keeps
            // the person attached to the same Verbo account when it does.
            $user = User::where('google_id', $claims['sub'])->first();

            if (! $user) {
                $user = User::where('email', $claims['email'])->first();
            }

            if ($user) {
                /* Link an existing password account to this Google identity.
                   Safe ONLY because the service refuses unverified addresses:
                   Google has proven the person controls this mailbox, which is
                   the same claim the password on that account stands for. */
                if (! $user->google_id) {
                    $user->google_id = $claims['sub'];
                    $user->save();
                }

                return $user;
            }

            $user = User::create([
                'name' => $claims['name'] ?: Str::before($claims['email'], '@'),
                'email' => $claims['email'],
                /* An unguessable value nobody ever sees or types. `password` is
                   NOT NULL and making it nullable would mean rebuilding the
                   users table on SQLite 3.33 — see the migration for why that
                   was not worth doing to the one table everything points at.
                   Consequence, and it is a real one: an account created this
                   way can only ever sign in with Google. */
                'password' => Hash::make(Str::random(64)),
            ]);

            /* Set outside the create, because neither column is in $fillable
               and mass assignment would drop both silently — the same trap
               TutorProfile.user_id hit. They stay out of $fillable on purpose:
               google_id is what proves an identity, so only this endpoint may
               write it, exactly as only the upload endpoint writes
               avatar_path. */
            $user->google_id = $claims['sub'];
            // Google has already verified it; recording otherwise would be a
            // worse record than recording nothing.
            $user->email_verified_at = now();
            $user->save();

            return $user;
        });
    }

    /**
     * Google sign-in by FULL-PAGE REDIRECT (GIS ux_mode "redirect").
     *
     * The popup flow needs a second window that can message the page back,
     * and in-app browsers (Telegram, Instagram, Facebook) cannot, so the popup
     * sat on a blank accounts.google.com. Here Google POSTs the credential to
     * this URL instead and the browser is sent back to the site.
     *
     * The Sanctum token never goes in a URL: the site gets a one-time code
     * that lives 2 minutes and is swapped for the token by googleExchange().
     * A failure also returns to the site, as ?google_error, never as a 500
     * page on the API's domain.
     */
    public function googleRedirect(Request $request, GoogleAuthService $google)
    {
        $front = rtrim(config('services.google.frontend_url'), '/');
        $fail = fn (string $why) => redirect()->away($front.'/login?google_error='.$why);

        if (! GoogleAuthService::configured() || ! is_string($request->input('credential'))) {
            return $fail('unavailable');
        }

        $claims = $google->verify($request->input('credential'));
        if (! $claims) {
            return $fail('unverified');
        }

        $user = $this->userFromGoogle($claims);
        $code = Str::random(48);
        Cache::put('google-login:'.$code, $user->id, now()->addMinutes(2));

        return redirect()->away($front.'/auth/google#code='.$code);
    }

    /** Swap the one-time code from googleRedirect() for a session. */
    public function googleExchange(Request $request)
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:100']]);

        // pull(): the code works once, even if the URL leaks afterwards.
        $userId = Cache::pull('google-login:'.$data['code']);
        $user = $userId ? User::find($userId) : null;
        if (! $user) {
            return response()->json(['message' => 'That sign-in link has expired. Try again.'], 401);
        }

        return response()->json(['user' => $user, 'token' => $user->createToken('verbo')->plainTextToken]);
    }

    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
        ]);

        $token = $user->createToken('verbo')->plainTextToken;

        /* Confirm the address, but do NOT make the account wait on it.
           Sign-up succeeds and returns a token either way; the app nags with
           a banner until the code is entered. Blocking here would mean one
           mail outage locks out every new sign-up at once, and this app has
           no queue to retry with — so the failure would be total. The send is
           deliberately unchecked for that reason: it cannot fail the
           registration, and EmailCodeService has already logged whatever went
           wrong. The user can resend from the banner. */
        EmailCodeService::send($user, EmailCode::VERIFY);

        return response()->json(['user' => $user, 'token' => $token], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $token = $user->createToken('verbo')->plainTextToken;

        return response()->json(['user' => $user, 'token' => $token]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user());
    }
}
