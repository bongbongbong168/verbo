<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Message extends Model
{
    use HasFactory;

    /** Typed by a person. */
    public const KIND_TEXT = 'text';

    /** Written by the app when a booking changes state — never typed. */
    public const KIND_EVENT = 'event';

    protected $fillable = [
        'conversation_id',
        'sender_id',
        'client_id',
        'kind',
        'body',
        'read_at',
        'attachment_path',
        'attachment_name',
        'attachment_mime',
        'attachment_size',
    ];

    /** Images render inline; everything else is offered as a download. */
    public function getIsImageAttribute(): bool
    {
        return str_starts_with((string) $this->attachment_mime, 'image/');
    }

    /* SQLite does not round-trip a column default onto the model returned by
       create(), so the default is stated here too — the same trap that bit
       `Flashcard.source_module` and `Booking.status`. */
    protected $attributes = ['kind' => self::KIND_TEXT];

    protected $casts = ['read_at' => 'datetime'];

    /** Written by the app rather than typed, so it is drawn as a note. */
    public function getIsEventAttribute(): bool
    {
        return $this->kind === self::KIND_EVENT;
    }

    public function conversation()
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender()
    {
        return $this->belongsTo(User::class, 'sender_id');
    }
}
