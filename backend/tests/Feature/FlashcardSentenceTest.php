<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\DictionaryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FlashcardSentenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_sentences_are_filtered_counted_and_kept_out_of_word_review(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $sentence = [
            'word' => '我们去机场接你。',
            'card_type' => 'sentence',
            'source_module' => 'read',
        ];

        $saved = $this->postJson('/api/flashcards', $sentence)
            ->assertCreated()
            ->assertJsonPath('card_type', 'sentence')
            ->assertJsonPath('pinyin', app(DictionaryService::class)->pinyinFor($sentence['word']))
            ->json();

        $this->postJson('/api/flashcards', $sentence)
            ->assertOk()
            ->assertJsonPath('id', $saved['id']);

        $this->postJson('/api/flashcards', [
            'word' => '我们去机场接你。',
            'card_type' => 'word',
            'source_module' => 'manual',
        ])->assertCreated();

        $this->getJson('/api/flashcards?type=sentence')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.card_type', 'sentence');

        $this->getJson('/api/flashcards/stats')
            ->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonPath('words', 1)
            ->assertJsonPath('sentences', 1);

        $this->getJson('/api/flashcards/review')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.card_type', 'word');
    }

    public function test_older_sentence_without_saved_pinyin_gets_a_local_reading_in_the_list(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $sentence = '请问，地铁站在哪儿？';
        $user->flashcards()->create([
            'word' => $sentence,
            'card_type' => 'sentence',
            'source_module' => 'read',
        ]);

        $this->getJson('/api/flashcards?type=sentence')
            ->assertOk()
            ->assertJsonPath('data.0.pinyin', app(DictionaryService::class)->pinyinFor($sentence));
    }

    public function test_review_card_includes_a_reading_for_its_example_sentence(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $example = '请问，地铁站在哪儿？';
        $user->flashcards()->create([
            'word' => '地铁站',
            'card_type' => 'word',
            'source_module' => 'read',
            'example' => $example,
        ]);

        $this->getJson('/api/flashcards/review?limit=1')
            ->assertOk()
            ->assertJsonPath('0.example', $example)
            ->assertJsonPath('0.example_pinyin', app(DictionaryService::class)->pinyinFor($example));
    }
}
