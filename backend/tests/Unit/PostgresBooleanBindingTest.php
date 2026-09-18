<?php

namespace Tests\Unit;

use App\Database\PostgresConnection;
use PHPUnit\Framework\TestCase;

/**
 * Behind the transaction pooler, emulated prepares paste bindings into the
 * SQL, and an integer 1 against a boolean column is an error in Postgres.
 */
class PostgresBooleanBindingTest extends TestCase
{
    public function test_booleans_are_bound_as_quotable_strings(): void
    {
        $connection = new PostgresConnection(fn () => null, 'db');

        $this->assertSame(
            ['true', 'false', 1, 'x', null],
            $connection->prepareBindings([true, false, 1, 'x', null])
        );
    }
}
