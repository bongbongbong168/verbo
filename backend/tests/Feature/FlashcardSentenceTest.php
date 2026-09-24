<?php

namespace Tests\Feature;

use App\Models\User;
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
}
