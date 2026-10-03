<?php

namespace Tests\Feature;

use App\Models\Podcast;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PodcastCommentTest extends TestCase
{
    use RefreshDatabase;

    private function episode(): Podcast
    {
        $admin = User::factory()->create(['is_admin' => true]);

        $ep = new Podcast(['title' => 'Ep', 'transcript' => '你好']);
        $ep->user_id = $admin->id;
        $ep->save();

        return $ep;
    }

    public function test_comment_reply_edit_and_delete(): void
    {
        $ep = $this->episode();
        $a = User::factory()->create();
        $b = User::factory()->create();

        $top = $this->actingAs($a)->postJson("/api/podcasts/{$ep->id}/comments", ['content' => ' Great episode '])
            ->assertCreated()->assertJsonPath('content', 'Great episode')->json('id');

        $reply = $this->actingAs($b)->postJson("/api/podcasts/{$ep->id}/comments", ['content' => 'Agreed', 'parent_id' => $top])
            ->assertCreated()->json('id');

        // A reply to a reply lands on the top-level comment.
        $this->actingAs($a)->postJson("/api/podcasts/{$ep->id}/comments", ['content' => 'Thanks', 'parent_id' => $reply])
            ->assertCreated();

        $list = $this->actingAs($a)->getJson("/api/podcasts/{$ep->id}/comments")->assertOk()->json();
        $this->assertCount(1, $list);
        $this->assertCount(2, $list[0]['replies']);
        $this->assertTrue($list[0]['mine']);

        // Someone else cannot edit or delete it.
        $this->actingAs($b)->putJson("/api/podcast-comments/{$top}", ['content' => 'x'])->assertForbidden();
        $this->actingAs($b)->deleteJson("/api/podcast-comments/{$top}")->assertForbidden();

        $this->actingAs($a)->putJson("/api/podcast-comments/{$top}", ['content' => 'Edited'])->assertOk()
            ->assertJsonPath('content', 'Edited');

        // Deleting the top comment takes its replies with it.
        $this->actingAs($a)->deleteJson("/api/podcast-comments/{$top}")->assertNoContent();
        $this->assertSame([], $this->actingAs($a)->getJson("/api/podcasts/{$ep->id}/comments")->json());
    }

    public function test_blank_comment_is_refused_and_admin_can_moderate(): void
    {
        $ep = $this->episode();
        $a = User::factory()->create();

        $this->actingAs($a)->postJson("/api/podcasts/{$ep->id}/comments", ['content' => '   '])->assertStatus(422);

        $id = $this->actingAs($a)->postJson("/api/podcasts/{$ep->id}/comments", ['content' => 'hi'])->json('id');
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin)->deleteJson("/api/podcast-comments/{$id}")->assertNoContent();
    }
}
