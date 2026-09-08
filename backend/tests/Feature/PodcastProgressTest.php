<?php

namespace Tests\Feature;

use App\Models\Podcast;
use App\Models\PodcastProgress;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PodcastProgressTest extends TestCase
{
    use RefreshDatabase;

    private function episode(User $owner, string $title = 'Test episode'): Podcast
    {
        $p = new Podcast(['title' => $title, 'transcript' => '你好']);
        $p->user_id = $owner->id;
        $p->save();

        return $p;
    }

    public function test_it_records_and_updates_one_row_per_listener(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $ep = $this->episode($user);

        $this->putJson("/api/podcasts/{$ep->id}/progress", [
            'position_seconds' => 90, 'duration_seconds' => 600,
        ])->assertOk()->assertJsonPath('position_seconds', 90);

        // Listening on is an UPDATE, not a second row — the unique index on
        // (user, podcast) is what the upsert leans on.
        $this->putJson("/api/podcasts/{$ep->id}/progress", [
            'position_seconds' => 150, 'duration_seconds' => 600,
        ])->assertOk()->assertJsonPath('position_seconds', 150);

        $this->assertSame(1, PodcastProgress::count());
        $this->assertSame(150, PodcastProgress::first()->position_seconds);
    }

    public function test_a_position_past_the_end_is_clamped(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $ep = $this->episode($user);

        // Both numbers come from the browser. An unclamped position would sit
        // outside the completion window and strand the episode in the row.
        $this->putJson("/api/podcasts/{$ep->id}/progress", [
            'position_seconds' => 99999, 'duration_seconds' => 600,
        ])->assertOk()->assertJsonPath('position_seconds', 600);
    }

    public function test_reaching_the_end_marks_it_finished(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $ep = $this->episode($user);

        // Inside FINISHED_WITHIN_SECONDS of the end: nobody listens through the
        // sign-off, and 99% would otherwise never leave "continue listening".
        $this->putJson("/api/podcasts/{$ep->id}/progress", [
            'position_seconds' => 595, 'duration_seconds' => 600,
        ])->assertOk();

        $this->assertNotNull(PodcastProgress::first()->completed_at);
        $this->getJson('/api/podcasts/continue')->assertOk()->assertJsonCount(0);
    }

    public function test_replaying_from_the_start_clears_the_finish(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $ep = $this->episode($user);

        $this->putJson("/api/podcasts/{$ep->id}/progress", ['position_seconds' => 595, 'duration_seconds' => 600]);
        $this->putJson("/api/podcasts/{$ep->id}/progress", ['position_seconds' => 40, 'duration_seconds' => 600]);

        $this->assertNull(PodcastProgress::first()->completed_at);
        $this->getJson('/api/podcasts/continue')->assertOk()->assertJsonCount(1);
    }

    public function test_a_few_seconds_in_is_not_a_position(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $ep = $this->episode($user);

        // Below RESUME_FLOOR_SECONDS: opening an episode and leaving is not
        // progress, and jumping someone back to 0:04 is noise.
        $this->putJson("/api/podcasts/{$ep->id}/progress", ['position_seconds' => 5, 'duration_seconds' => 600]);

        $this->getJson('/api/podcasts/continue')->assertOk()->assertJsonCount(0);
        $this->getJson("/api/podcasts/{$ep->id}")->assertOk()->assertJsonPath('progress.resume', false);
    }

    public function test_show_tells_the_player_where_to_resume(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $ep = $this->episode($user);

        $this->putJson("/api/podcasts/{$ep->id}/progress", ['position_seconds' => 200, 'duration_seconds' => 600]);

        $this->getJson("/api/podcasts/{$ep->id}")
            ->assertOk()
            ->assertJsonPath('progress.resume', true)
            ->assertJsonPath('progress.position_seconds', 200);
    }

    public function test_progress_is_per_listener(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $ep = $this->episode($a);

        Sanctum::actingAs($a);
        $this->putJson("/api/podcasts/{$ep->id}/progress", ['position_seconds' => 300, 'duration_seconds' => 600]);

        // B has never played it, so B resumes nothing and sees an empty row.
        Sanctum::actingAs($b);
        $this->getJson("/api/podcasts/{$ep->id}")->assertOk()->assertJsonPath('progress', null);
        $this->getJson('/api/podcasts/continue')->assertOk()->assertJsonCount(0);
    }

    /**
     * `/podcasts/continue` must resolve before `/podcasts/{podcast}`, or
     * "continue" binds as an id — the trap several other routes here hit.
     */
    public function test_continue_is_a_route_not_an_id(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $ep = $this->episode($user);
        $this->putJson("/api/podcasts/{$ep->id}/progress", ['position_seconds' => 120, 'duration_seconds' => 600]);

        $res = $this->getJson('/api/podcasts/continue')->assertOk();
        $res->assertJsonCount(1);
        $res->assertJsonPath('0.podcast.id', $ep->id);
        $res->assertJsonPath('0.position_seconds', 120);
        // If it had bound as an id it would answer with an episode object.
        $this->assertIsArray($res->json());
    }

    public function test_a_deleted_episode_does_not_blank_a_slot(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $keep = $this->episode($user, 'Kept');
        $gone = $this->episode($user, 'Deleted');

        $this->putJson("/api/podcasts/{$keep->id}/progress", ['position_seconds' => 120, 'duration_seconds' => 600]);
        $this->putJson("/api/podcasts/{$gone->id}/progress", ['position_seconds' => 200, 'duration_seconds' => 600]);
        $gone->delete();

        $this->getJson('/api/podcasts/continue')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.podcast.id', $keep->id);
    }
}
