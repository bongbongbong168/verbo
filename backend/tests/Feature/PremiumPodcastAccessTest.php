<?php

namespace Tests\Feature;

use App\Models\Podcast;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PremiumPodcastAccessTest extends TestCase
{
    use RefreshDatabase;

    private function premiumPodcast(): Podcast
    {
        $owner = User::factory()->create(['is_admin' => true]);

        return $owner->podcasts()->create([
            'title' => 'Premium listening',
            'transcript' => '完整的中文播客文字稿。',
            'transcript_en' => 'The complete English transcript.',
            'bio' => 'A visible description for every learner.',
            'audio_path' => 'podcasts/premium.mp3',
            'is_premium' => true,
        ]);
    }

    public function test_free_listener_sees_metadata_but_not_audio_or_transcripts(): void
    {
        $podcast = $this->premiumPodcast();
        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson("/api/podcasts/{$podcast->id}")
            ->assertOk()
            ->assertJsonPath('premium_locked', true)
            ->assertJsonPath('bio', $podcast->bio)
            ->assertJsonPath('has_audio', true)
            ->assertJsonPath('audio_url', null)
            ->assertJsonPath('transcript', null)
            ->assertJsonPath('transcript_en', null)
            ->assertJsonCount(0, 'tokens');

        $response->assertJsonMissingPath('audio_path');
    }

    public function test_pro_listener_receives_full_playback_and_transcripts(): void
    {
        $podcast = $this->premiumPodcast();
        Sanctum::actingAs(User::factory()->create(['is_pro' => true]));

        $response = $this->getJson("/api/podcasts/{$podcast->id}")
            ->assertOk()
            ->assertJsonPath('premium_locked', false)
            ->assertJsonPath('transcript', $podcast->transcript)
            ->assertJsonPath('transcript_en', $podcast->transcript_en);

        $this->assertStringContainsString('signature=', $response->json('audio_url'));
    }

    public function test_free_listener_cannot_bypass_gate_through_related_endpoints(): void
    {
        $podcast = $this->premiumPodcast();
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/podcasts/{$podcast->id}/timed-transcript")->assertForbidden();
        $this->putJson("/api/podcasts/{$podcast->id}/progress", [
            'position_seconds' => 30,
            'duration_seconds' => 300,
        ])->assertForbidden();
        $this->get("/api/podcasts/{$podcast->id}/audio")->assertForbidden();
    }

    public function test_signed_premium_audio_url_can_stream(): void
    {
        Storage::fake('public');
        Storage::fake('local');
        Storage::disk('local')->put('podcasts/premium.mp3', 'audio bytes');
        $podcast = $this->premiumPodcast();

        $url = URL::temporarySignedRoute(
            'podcasts.audio',
            now()->addMinute(),
            ['podcast' => $podcast->id]
        );

        $this->get($url)->assertOk();
    }

    public function test_free_episode_remains_available_to_free_listener(): void
    {
        $owner = User::factory()->create(['is_admin' => true]);
        $podcast = $owner->podcasts()->create([
            'title' => 'Free listening',
            'transcript' => '大家好。',
            'audio_path' => 'podcasts/free.mp3',
            'is_premium' => false,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/podcasts/{$podcast->id}")
            ->assertOk()
            ->assertJsonPath('premium_locked', false)
            ->assertJsonPath('transcript', $podcast->transcript);
    }

    public function test_marking_an_episode_premium_moves_its_audio_to_private_storage(): void
    {
        Storage::fake('public');
        Storage::fake('local');
        Storage::disk('public')->put('podcasts/free.mp3', 'audio bytes');
        $admin = User::factory()->create(['is_admin' => true]);
        $podcast = $admin->podcasts()->create([
            'title' => 'Change my access',
            'transcript' => '大家好。',
            'audio_path' => 'podcasts/free.mp3',
        ]);
        Sanctum::actingAs($admin);

        $this->putJson("/api/podcasts/{$podcast->id}", [
            'title' => $podcast->title,
            'transcript' => $podcast->transcript,
            'is_premium' => true,
        ])->assertOk()->assertJsonPath('is_premium', true);

        Storage::disk('local')->assertExists('podcasts/free.mp3');
        Storage::disk('public')->assertMissing('podcasts/free.mp3');
    }
}
