<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScanWordListTest extends TestCase
{
    use RefreshDatabase;

    /* A scan's word list holds each word once and never punctuation - also
       for scans saved before the rule, which are cleaned when opened. */
    public function test_words_are_unique_and_punctuation_free(): void
    {
        $user = User::factory()->create();
        $scan = $user->scans()->create([
            'original_filename' => 'a.jpg',
            'raw_text' => '花，花。',
            'words' => [
                ['word' => '花', 'pinyin' => 'huā', 'translation' => 'flower'],
                ['word' => '，', 'pinyin' => '', 'translation' => null],
                ['word' => '。', 'pinyin' => '', 'translation' => null],
                ['word' => '花', 'pinyin' => 'huā', 'translation' => 'flower'],
                ['word' => '老爷爷。', 'pinyin' => 'lǎo yé ye', 'translation' => 'grandpa'],
            ],
        ]);

        $words = collect($this->actingAs($user)->getJson("/api/scans/{$scan->id}")->assertOk()->json('words'))->pluck('word')->all();

        $this->assertSame(['花', '老爷爷'], $words);
    }
}
