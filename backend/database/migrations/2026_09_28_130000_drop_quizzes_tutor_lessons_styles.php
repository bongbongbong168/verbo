<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/* "Quizzes" and "Tutor Lessons" left LearningPreference::STYLES: neither
   changed anything (no quest or ranking used them in a way a learner would
   notice). Stripped from saved answers so re-saving Settings cannot 422. */
return new class extends Migration
{
    public function up(): void
    {
        $gone = ['Quizzes', 'Tutor Lessons'];
        DB::table('learning_preferences')->whereNotNull('styles')->orderBy('id')->each(function ($row) use ($gone) {
            $styles = json_decode($row->styles, true);
            if (! is_array($styles) || ! array_intersect($styles, $gone)) {
                return;
            }
            DB::table('learning_preferences')->where('id', $row->id)->update([
                'styles' => json_encode(array_values(array_diff($styles, $gone))),
            ]);
        });
    }

    public function down(): void
    {
    }
};
