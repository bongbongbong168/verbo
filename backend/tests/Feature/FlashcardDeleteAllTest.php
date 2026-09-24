<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FlashcardDeleteAllTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_empties_only_the_callers_bank(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();

        foreach (['你好', '谢谢', '再见'] as $word) {
            $me->flashcards()->create(['word' => $word, 'source_module' => 'manual']);
        }
        $other->flashcards()->create(['word' => '朋友', 'source_module' => 'manual']);

        Sanctum::actingAs($me);

        $this->deleteJson('/api/flashcards')
            ->assertOk()
            ->assertJson(['deleted' => 3]);

        $this->assertSame(0, $me->flashcards()->count());
        $this->assertSame(1, $other->flashcards()->count());
    }

    public function test_it_is_behind_auth(): void
    {
        $this->deleteJson('/api/flashcards')->assertUnauthorized();
    }
}
