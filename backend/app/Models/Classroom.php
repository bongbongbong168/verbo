<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * A teaching class: a roster, a curriculum feed and a join code.
 *
 * Not a `Course` — that is a sellable product with a price and a checkout.
 * See the create_classrooms migration for why the two are kept apart.
 */
class Classroom extends Model
{
    use HasFactory;

    /**
     * `join_code` is deliberately NOT fillable — it is the credential that
     * gets someone into a class, so only the controller may set it, never a
     * request body. Assign it directly:
     *
     *     $class = new Classroom($data);
     *     $class->join_code = Classroom::makeJoinCode($data['name']);
     */
    protected $fillable = [
        'name',
        'subject',
        'level',
        'focus',
        'term',
        'description',
        'join_open',
    ];

    protected $casts = [
        'join_open' => 'boolean',
        'archived_at' => 'datetime',
    ];

    /** The teacher. */
    public function teacher()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function members()
    {
        return $this->hasMany(ClassroomMember::class);
    }

    public function students()
    {
        return $this->belongsToMany(User::class, 'classroom_members')->withTimestamps();
    }

    public function items()
    {
        return $this->hasMany(ClassroomItem::class)->latest('id');
    }

    public function assignments()
    {
        return $this->hasMany(ClassroomItem::class)->where('type', 'assignment');
    }

    /**
     * A short, unambiguous code the teacher can read aloud.
     *
     * The alphabet deliberately drops O/0 and I/1/L — a code is dictated across
     * a room, and those are the pairs people mishear. Retries on collision
     * because the column is unique and a clash must not surface as a 500.
     */
    public static function makeJoinCode(?string $prefix = null): string
    {
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

        do {
            $tail = '';
            for ($i = 0; $i < 4; $i++) {
                $tail .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }

            $head = $prefix
                ? Str::upper(preg_replace('/[^A-Za-z0-9]/', '', Str::substr($prefix, 0, 4)))
                : '';

            $code = $head ? $head.'-'.$tail : $tail;
        } while (self::where('join_code', $code)->exists());

        return $code;
    }
}
