<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PodcastDeletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_delete_a_draft_podcast_without_audio(): void
    {
        Storage::fake('public');
        Storage::fake('local');

        $admin = User::factory()->create(['is_admin' => true]);
        $podcast = $admin->podcasts()->create([
            'title' => 'Draft episode',
            'transcript' => '你好',
        ]);

        Sanctum::actingAs($admin);

        $this->deleteJson('/api/podcasts/'.$podcast->id)
            ->assertOk()
            ->assertJson(['message' => 'Deleted']);

        $this->assertDatabaseMissing('podcasts', ['id' => $podcast->id]);
    }
}
