<?php

use Illuminate\Support\Facades\Broadcast;
use App\Models\Conversation;

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
|
| Here you may register all of the event broadcasting channels that your
| application supports. The given channel authorization callbacks are
| used to check if an authenticated user can listen to the channel.
|
*/

Broadcast::channel('users.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// A conversation channel is useful for a future full live thread view. Its
// rule mirrors Conversation::allows(), so a guessed id never grants access.
Broadcast::channel('conversations.{conversation}', function ($user, $conversation) {
    return Conversation::find($conversation)?->allows($user) ?? false;
});
