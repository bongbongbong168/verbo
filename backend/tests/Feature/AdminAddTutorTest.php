<?php

namespace Tests\Feature;

use App\Models\TutorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAddTutorTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_turns_an_existing_account_into_an_approved_tutor(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $person = User::factory()->create(['email' => 'Teacher@Example.com']);

        $id = $this->actingAs($admin)->postJson('/api/tutors/admin-add', ['email' => ' teacher@example.com '])
            ->assertCreated()->json('id');

        $profile = TutorProfile::find($id);
        $this->assertSame((int) $person->id, (int) $profile->user_id);
        $this->assertSame(TutorProfile::APPROVED, $profile->status);
        // Listed on Find Tutor straight away.
        $this->assertContains($id, collect($this->actingAs($admin)->getJson('/api/tutors')->json())->pluck('id')->all());
    }

    public function test_a_pending_application_is_approved_and_nothing_is_duplicated(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $person = User::factory()->create();
        $p = $person->tutorProfile()->create(['bio' => 'Hi']);
        $p->forceFill(['status' => TutorProfile::PENDING])->save();

        $this->actingAs($admin)->postJson('/api/tutors/admin-add', ['email' => $person->email])->assertCreated();

        $this->assertSame(1, TutorProfile::where('user_id', $person->id)->count());
        $this->assertSame(TutorProfile::APPROVED, $p->fresh()->status);
        $this->assertSame('Hi', $p->fresh()->bio);
    }

    public function test_unknown_email_and_non_admins_are_refused(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin)->postJson('/api/tutors/admin-add', ['email' => 'nobody@example.com'])->assertStatus(422);

        $student = User::factory()->create();
        $this->actingAs($student)->postJson('/api/tutors/admin-add', ['email' => $admin->email])->assertForbidden();
    }
}
