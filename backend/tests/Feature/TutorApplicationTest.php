<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\TutorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TutorApplicationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    /** A complete, valid application body. */
    private function application(array $overrides = []): array
    {
        return array_merge([
            'bio' => 'I have taught Mandarin to beginners and HSK candidates for several years.',
            'subjects' => 'Speaking, HSK preparation',
            'languages_spoken' => 'Chinese, English',
            'country' => 'China',
            'chinese_level' => 'Native speaker',
            'teaches_levels' => ['Beginner', 'HSK preparation'],
            'years_experience' => 3,
        ], $overrides);
    }

    private function applyAs(User $user, array $overrides = [])
    {
        Sanctum::actingAs($user);

        return $this->postJson('/api/tutor-profile', $this->application($overrides));
    }

    public function test_applying_creates_a_pending_application_not_a_live_tutor(): void
    {
        $applicant = User::factory()->create();
        $this->applyAs($applicant)->assertOk();

        $profile = TutorProfile::first();
        $this->assertSame(TutorProfile::PENDING, $profile->status);
        $this->assertNotNull($profile->submitted_at);

        // The whole point: it is NOT in the marketplace yet.
        $this->getJson('/api/tutors')->assertOk()->assertJsonCount(0);
    }

    /**
     * Filtering the list is not enough — this route takes an id, so a stranger
     * holding the URL would otherwise read an unreviewed profile.
     */
    public function test_a_pending_profile_is_not_readable_by_a_stranger(): void
    {
        $applicant = User::factory()->create();
        $this->applyAs($applicant);
        $id = TutorProfile::first()->id;

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/tutors/{$id}")->assertNotFound();

        // The applicant and an admin may see it.
        Sanctum::actingAs($applicant);
        $this->getJson("/api/tutors/{$id}")->assertOk();
        Sanctum::actingAs($this->admin());
        $this->getJson("/api/tutors/{$id}")->assertOk();
    }

    public function test_an_incomplete_application_is_rejected_by_validation(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/tutor-profile', ['bio' => 'too short'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['bio', 'subjects', 'languages_spoken', 'country', 'chinese_level', 'teaches_levels', 'years_experience']);
    }

    public function test_teaches_levels_is_checked_against_the_whitelist(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/tutor-profile', $this->application(['teaches_levels' => ['Wizardry']]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['teaches_levels.0']);
    }

    public function test_only_an_admin_can_see_the_queue_or_decide(): void
    {
        $applicant = User::factory()->create();
        $this->applyAs($applicant);
        $id = TutorProfile::first()->id;

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/tutor-applications')->assertForbidden();
        $this->getJson("/api/tutor-applications/{$id}")->assertForbidden();
        $this->postJson("/api/tutor-applications/{$id}/decide", ['decision' => 'approved'])->assertForbidden();
    }

    public function test_approving_publishes_the_tutor_and_notifies_them(): void
    {
        $applicant = User::factory()->create();
        $this->applyAs($applicant);
        $id = TutorProfile::first()->id;

        Sanctum::actingAs($this->admin());
        $this->postJson("/api/tutor-applications/{$id}/decide", ['decision' => 'approved'])
            ->assertOk()
            ->assertJsonPath('status', 'approved');

        // Now, and only now, it is in the marketplace.
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/tutors')->assertOk()->assertJsonCount(1);
        $this->getJson("/api/tutors/{$id}")->assertOk();

        $note = Notification::where('user_id', $applicant->id)->first();
        $this->assertSame('tutor_application_approved', $note->type);
        $this->assertSame("/find-tutor/{$id}", $note->link);
    }

    /** "No" without a reason is not a decision the applicant can act on. */
    public function test_rejecting_and_asking_for_more_information_both_require_a_note(): void
    {
        $applicant = User::factory()->create();
        $this->applyAs($applicant);
        $id = TutorProfile::first()->id;

        Sanctum::actingAs($this->admin());
        $this->postJson("/api/tutor-applications/{$id}/decide", ['decision' => 'rejected'])
            ->assertStatus(422)->assertJsonValidationErrors(['note']);
        $this->postJson("/api/tutor-applications/{$id}/decide", ['decision' => 'needs_info'])
            ->assertStatus(422)->assertJsonValidationErrors(['note']);

        // Approving needs none — there is nothing to explain.
        $this->postJson("/api/tutor-applications/{$id}/decide", ['decision' => 'approved'])->assertOk();
    }

    public function test_needs_info_lets_the_applicant_resubmit_into_the_queue(): void
    {
        $applicant = User::factory()->create();
        $this->applyAs($applicant);
        $id = TutorProfile::first()->id;

        Sanctum::actingAs($this->admin());
        $this->postJson("/api/tutor-applications/{$id}/decide", [
            'decision' => 'needs_info', 'note' => 'Please attach your HSK certificate.',
        ])->assertOk();

        $this->assertSame('needs_info', TutorProfile::find($id)->status);
        $this->assertSame('Please attach your HSK certificate.', TutorProfile::find($id)->review_note);

        // Resubmitting clears the old decision rather than leaving it to
        // contradict the new state.
        $this->applyAs($applicant, ['years_experience' => 4])->assertOk();
        $fresh = TutorProfile::find($id);
        $this->assertSame(TutorProfile::PENDING, $fresh->status);
        $this->assertNull($fresh->review_note);
        $this->assertNull($fresh->reviewed_at);
    }

    /**
     * An approved tutor editing their details must not be pulled off the
     * marketplace and put back in the queue — they would vanish mid-term with
     * live bookings against them.
     */
    public function test_an_approved_tutor_cannot_be_returned_to_the_queue_by_reapplying(): void
    {
        $applicant = User::factory()->create();
        $this->applyAs($applicant);
        $id = TutorProfile::first()->id;

        Sanctum::actingAs($this->admin());
        $this->postJson("/api/tutor-applications/{$id}/decide", ['decision' => 'approved'])->assertOk();

        $this->applyAs($applicant, ['bio' => str_repeat('An updated biography for the profile. ', 2)])
            ->assertStatus(409);

        $this->assertSame(TutorProfile::APPROVED, TutorProfile::find($id)->status);
    }

    /**
     * Tutors who predate the application process were grandfathered as approved
     * with no submission. Rejecting one would delist someone mid-term through a
     * queue they were never in.
     */
    public function test_a_grandfathered_tutor_has_nothing_to_review(): void
    {
        $tutor = User::factory()->create();
        $profile = $tutor->tutorProfile()->create(['bio' => 'Existing tutor from before verification.']);
        $profile->forceFill(['status' => TutorProfile::APPROVED, 'submitted_at' => null])->save();

        Sanctum::actingAs($this->admin());
        $this->postJson("/api/tutor-applications/{$profile->id}/decide", [
            'decision' => 'rejected', 'note' => 'no',
        ])->assertStatus(409);

        $this->assertSame(TutorProfile::APPROVED, $profile->fresh()->status);
        // And they never appear in the queue in the first place.
        $this->getJson('/api/tutor-applications')->assertOk()->assertJsonCount(0);
    }

    public function test_the_queue_shows_what_is_waiting_oldest_first(): void
    {
        $admin = $this->admin();
        foreach (['A', 'B'] as $i => $name) {
            $u = User::factory()->create(['name' => $name]);
            $this->applyAs($u);
            TutorProfile::where('user_id', $u->id)->update(['submitted_at' => now()->subDays(2 - $i)]);
        }

        Sanctum::actingAs($admin);
        $res = $this->getJson('/api/tutor-applications')->assertOk()->assertJsonCount(2);
        $this->assertSame('A', $res->json('0.name'), 'A queue serves the earliest applicant first.');

        $this->getJson('/api/tutor-applications/counts')
            ->assertOk()
            ->assertJsonPath('awaiting', 2)
            ->assertJsonPath('approved', 0);
    }
}
