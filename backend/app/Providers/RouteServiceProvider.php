<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    /**
     * The path to the "home" route for your application.
     *
     * Typically, users are redirected here after authentication.
     *
     * @var string
     */
    public const HOME = '/home';

    /**
     * Define your route model bindings, pattern filters, and other route configuration.
     *
     * @return void
     */
    public function boot()
    {
        $this->configureRateLimiting();

        $this->routes(function () {
            Route::middleware('api')
                ->prefix('api')
                ->group(base_path('routes/api.php'));

            Route::middleware('web')
                ->group(base_path('routes/web.php'));
        });
    }

    /**
     * Configure the rate limiters for the application.
     *
     * @return void
     */
    protected function configureRateLimiting()
    {
        // General API traffic. A single page view fans out to several requests
        // (and React StrictMode doubles them in dev), so 60/min trips far too
        // easily during normal browsing.
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(300)->by($request->user()?->id ?: $request->ip());
        });

        // Login/register stay tight — these are the brute-force surface, and
        // they must not inherit the relaxed general limit above.
        RateLimiter::for('auth', function (Request $request) {
            return Limit::perMinute(10)->by($request->ip());
        });

        /*
         * The AI assistant gets its own bucket, well under the general 300.
         *
         * Every other endpoint here costs a database query; this one costs a
         * call against a metered third-party quota that is shared by everyone
         * on the install. At 300/min one person holding the send key could
         * spend the day's free tier before anybody else opened the widget.
         * 15/min is far above a real conversation — nobody types fifteen
         * sentences of Chinese in a minute — and far below a script.
         *
         * Keyed by user id, never IP: this route is behind auth:sanctum, and
         * keying by IP would make one campus or one office share a single
         * allowance.
         */
        RateLimiter::for('ai', function (Request $request) {
            return Limit::perMinute(15)->by($request->user()?->id ?: $request->ip());
        });

        // Study audio: a first play of a whole conversation asks for every
        // line at once, so this is looser than 'ai' - but it still spends the
        // same shared Gemini quota, so it is its own bucket, per user.
        RateLimiter::for('speech', function (Request $request) {
            return Limit::perMinute(40)->by($request->user()?->id ?: $request->ip());
        });
    }
}
