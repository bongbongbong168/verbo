<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SavedItem extends Model
{
    protected $fillable = ['user_id', 'kind', 'item_id'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
