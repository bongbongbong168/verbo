<?php

namespace App\Providers;

use App\Database\PostgresConnection;
use App\Mail\BrevoTransport;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * @return void
     */
    public function register()
    {
        // Booleans as 'true'/'false' on Postgres - see the class for why the
        // transaction pooler makes Laravel's default integer binding fail.
        Connection::resolverFor('pgsql', fn ($pdo, $database, $prefix, $config) => new PostgresConnection($pdo, $database, $prefix, $config));
    }

    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot()
    {
        /*
         * The `brevo` mail driver — Laravel has no built-in one.
         *
         * Registered here rather than being called directly from the one
         * place that sends mail, so notifications, mail templates and
         * `Notification::fake()` in tests all keep working unchanged; only
         * the transport underneath differs. Production sets MAIL_MAILER=brevo
         * because Railway blocks outbound SMTP; a laptop can keep using
         * plain SMTP, where it works fine. See BrevoTransport.
         */
        Mail::extend('brevo', function (array $config = []) {
            return new BrevoTransport(
                (string) ($config['key'] ?? config('services.brevo.key')),
                (int) ($config['timeout'] ?? config('services.brevo.timeout')),
            );
        });
    }
}
