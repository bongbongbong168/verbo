<?php

namespace Tests\Feature;

use App\Models\TutorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TutorSpecialtyTest extends TestCase
{
    use RefreshDatabase;

    private function tutor(): array
    {
        $user = User::factory()->create();
        $profile = $user->tutorProfile()->create(['bio' => 'A tutor.', 'subjects' => 'Chinese Tutor']);
        $profile->forceFill(['status' => TutorProfile::APPROVED])->save();

        return [$user, $profile];
    }

    public function test_a_tutor_picks_specialties_and_the_page_lists_them_main_first(): void
    {
        [$user, $profile] = $this->tutor();
        Sanctum::actingAs($user);

        $this->putJson("/api/tutors/{$profile->id}/specialties", [
            'specialties' => ['speaking', 'hsk', 'conversational'],
            'main_specialty' => 'conversational',
        ])->assertOk()
            ->assertJsonPath('main_specialty', 'conversational')
            ->assertJsonPath('specialty_list.0.key', 'conversational')
            ->assertJsonPath('specialty_list.0.main', true)
            ->assertJsonPath('specialty_list.0.label', 'Conversational Chinese')
            ->assertJsonCount(3, 'specialty_list');
    }

    public function test_the_main_falls_back_to_the_first_chosen_and_an_empty_list_clears_it(): void
    {
        [$user, $profile] = $this->tutor();
        Sanctum::actingAs($user);

        $this->putJson("/api/tutors/{$profile->id}/specialties", [
            'specialties' => ['travel', 'pronunciation'],
            'main_specialty' => 'hsk',
        ])->assertOk()->assertJsonPath('main_specialty', 'travel');

        $this->putJson("/api/tutors/{$profile->id}/specialties", ['specialties' => []])
            ->assertOk()
            ->assertJsonPath('main_specialty', null)
            ->assertJsonCount(0, 'specialty_list');
    }

    public function test_unknown_specialties_are_refused_and_strangers_cannot_edit(): void
    {
        [$user, $profile] = $this->tutor();

        Sanctum::actingAs($user);
        $this->putJson("/api/tutors/{$profile->id}/specialties", ['specialties' => ['astrology']])
            ->assertStatus(422);

        Sanctum::actingAs(User::factory()->create());
        $this->putJson("/api/tutors/{$profile->id}/specialties", ['specialties' => ['hsk']])
            ->assertForbidden();
    }

    public function test_an_application_must_name_at_least_one_specialty(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/tutor-profile', [
            'bio' => str_repeat('I teach Mandarin to adults. ', 3),
            'subjects' => 'Chinese Tutor',
            'languages_spoken' => 'Chinese, English',
            'country' => 'China',
            'chinese_level' => 'Native speaker',
            'teaches_levels' => ['Beginner'],
            'years_experience' => 3,
        ])->assertStatus(422)->assertJsonValidationErrors('specialties');
    }
}
