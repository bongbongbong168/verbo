<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/* "Videos" was removed from LearningPreference::STYLES: Verbo has no video
   content, so the answer matched nothing. Stripping it from saved answers
   matters because Settings re-sends every value on save, and the validator
   would now refuse a stored "Videos" with a 422. */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('learning_preferences')->whereNotNull('styles')->orderBy('id')->each(function ($row) {
            $styles = json_decode($row->styles, true);
            if (! is_array($styles) || ! in_array('Videos', $styles, true)) {
                return;
            }
            DB::table('learning_preferences')->where('id', $row->id)->update([
                'styles' => json_encode(array_values(array_diff($styles, ['Videos']))),
            ]);
        });
    }

    public function down(): void
    {
        // Nothing to restore: which rows held "Videos" is not recorded.
    }
};
