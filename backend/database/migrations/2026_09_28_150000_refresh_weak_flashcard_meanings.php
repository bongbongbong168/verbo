<?php

use App\Services\DictionaryService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/* Cards keep the meaning they were saved with, and cards saved before the
   dictionary learned to skip weak senses carry text like "used in
   上聲|上声[shang3 sheng1]" or "surname Ji". Each such card gets the current
   dictionary meaning; anything else keeps its text, only tidied of CEDICT's
   trad|simp[pinyin] markup. A card with no better meaning is left as it is.
   Best-effort: a server without the dictionary files skips it. */
return new class extends Migration
{
    public function up(): void
    {
        try {
            $dict = app(DictionaryService::class);
            $dict->lookup('上');
        } catch (\Throwable $e) {
            return;
        }

        DB::table('flashcards')->whereNotNull('translation')->orderBy('id')->each(function ($card) use ($dict) {
            $old = $card->translation;
            $new = DictionaryService::tidy($old);

            if ($dict->isWeak($old) || str_contains($old, '[')) {
                $fresh = $dict->lookup($card->word);
                if ($fresh && ! $dict->isWeak($fresh)) {
                    $new = $fresh;
                }
            }

            if ($new !== $old && $new !== '') {
                DB::table('flashcards')->where('id', $card->id)->update(['translation' => $new]);
            }
        });
    }

    public function down(): void
    {
    }
};
