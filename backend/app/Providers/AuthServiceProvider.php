<?php

namespace App\Providers;

// use Illuminate\Support\Facades\Gate;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * The model to policy mappings for the application.
     *
     * @var array<class-string, class-string>
     */
    protected $policies = [
        // 'App\Models\Model' => 'App\Policies\ModelPolicy',
    ];

    /**
     * Register any authentication / authorization services.
     *
     * @return void
     */
    public function boot()
    {
        $this->registerPolicies();

        /*
         * THE RESET LINK POINTS AT THE REACT APP, NOT AT LARAVEL.
         *
         * Laravel's default builds a URL to a named `password.reset` web
         * route, and this app has no such page — it is an API with the UI on
         * a different origin entirely (see the CORS note: the frontend is
         * Vercel, the API is Railway). Left alone, every reset email would
         * send people to a 404 on the API domain.
         *
         * The email rides along too. The reset endpoint needs it to look the
         * token up, and asking someone to retype the address they just
         * entered — on a page they reached by clicking a link — is a step
         * that can only go wrong.
         *
         * FRONTEND_URL is the same variable CORS already trusts, so there is
         * one answer to "where does the app live" rather than two that can
         * disagree.
         */
        ResetPassword::createUrlUsing(function ($user, string $token) {
            $base = rtrim(config('app.frontend_url'), '/');

            return $base.'/reset-password/'.$token.'?email='.urlencode($user->getEmailForPasswordReset());
        });
    }
}
