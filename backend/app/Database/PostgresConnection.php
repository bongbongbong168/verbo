<?php

namespace App\Database;

use Illuminate\Database\PostgresConnection as BasePostgresConnection;

/**
 * Postgres, with booleans bound as 'true' / 'false'.
 *
 * Laravel turns a PHP bool into the INTEGER 1 or 0 before binding it. With
 * native prepared statements that is harmless: the value travels as a typed
 * parameter and Postgres coerces it to the boolean column. But production
 * runs behind Supabase's transaction pooler with PDO::ATTR_EMULATE_PREPARES
 * on (see config/database.php), and emulation pastes the value into the SQL
 * as a bare literal - `where is_admin = 1` - which Postgres refuses outright:
 * "operator does not exist: boolean = integer". Every boolean where-clause
 * and every save of a boolean column (is_trial, is_admin, ...) would fail.
 *
 * As strings they are quoted - `where is_admin = 'true'` - an untyped literal
 * Postgres reads as the column's own type. Measured on the production
 * database both ways before this was written. Harmless with native prepares
 * too, where a text parameter 'true' casts to boolean the same way.
 */
class PostgresConnection extends BasePostgresConnection
{
    public function prepareBindings(array $bindings)
    {
        foreach ($bindings as $key => $value) {
            if (is_bool($value)) {
                $bindings[$key] = $value ? 'true' : 'false';
            }
        }

        return parent::prepareBindings($bindings);
    }
}
