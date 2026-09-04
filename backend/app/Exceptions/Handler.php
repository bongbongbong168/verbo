<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Request;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * A list of exception types with their corresponding custom log levels.
     *
     * @var array<class-string<\Throwable>, \Psr\Log\LogLevel::*>
     */
    protected $levels = [
        //
    ];

    /**
     * A list of the exception types that are not reported.
     *
     * @var array<int, class-string<\Throwable>>
     */
    protected $dontReport = [
        //
    ];

    /**
     * A list of the inputs that are never flashed to the session on validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     *
     * @return void
     */
    public function register()
    {
        $this->reportable(function (Throwable $e) {
            //
        });

        /* A request bigger than php's post_max_size is rejected by php before
           any of this app runs — $_POST and $_FILES arrive EMPTY — and
           Laravel's ValidatePostSize middleware turns that into a 413 with an
           EMPTY message. The client then shows a blank error for what is only
           a file that is too large.
           Handled here rather than per-controller because the middleware runs
           long before any controller does, and because every upload in the app
           (podcast audio, chat attachments, classroom submissions, avatars)
           fails the same way. */
        $this->renderable(function (PostTooLargeException $e, Request $request) {
            $limit = static::iniBytes(ini_get('post_max_size'));

            return response()->json([
                'message' => $limit > 0
                    ? 'That upload is too large. The server accepts up to '
                        .round($limit / 1048576).'MB in a single request.'
                    : 'That upload is too large for the server to accept.',
            ], 413);
        });
    }

    /** php.ini shorthand ("64M", "8K") to bytes. */
    protected static function iniBytes(?string $value): int
    {
        if (! $value) {
            return 0;
        }

        $value = trim($value);
        $number = (int) $value;

        switch (strtolower(substr($value, -1))) {
            case 'g': return $number * 1073741824;
            case 'm': return $number * 1048576;
            case 'k': return $number * 1024;
            default: return $number;
        }
    }

    /**
     * This app is API-only (no web login page to redirect to), so
     * unauthenticated requests always get a JSON 401, never a redirect.
     */
    protected function unauthenticated($request, AuthenticationException $exception)
    {
        return response()->json(['message' => $exception->getMessage()], 401);
    }
}
