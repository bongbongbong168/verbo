<?php

namespace App\Providers;

// use Illuminate\Support\Facades\Gate;
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
         * Nothing to configure for password resets any more.
         *
         * This used to carry a `ResetPassword::createUrlUsing()` override,
         * pointing Laravel's emailed LINK at the React app instead of at a
         * `password.reset` web route this API does not have. Resets are a
         * six-digit code now (see PasswordResetController), so there is no
         * link to aim anywhere and Laravel's broker is not used at all.
         */
    }
}
