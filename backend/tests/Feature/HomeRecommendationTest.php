<?php

namespace Tests\Feature;

use App\Models\Podcast;
use App\Models\TutorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Home ranks tutors and podcasts from the learner's saved preferences. */
class HomeRecommendationTest extends TestCase
{
    use RefreshDatabase;

    private function tutor(string $name, array $specialties, array $levels): TutorProfile
    {
        $user = User::factory()->create(['name' => $name]);
        $p = $user->tutorProfile()->create(['bio' => 'Tutor', 'subjects' => 'Chinese', 'specialties' => $specialties, 'teaches_levels' => $levels]);
        $p->forceFill(['status' => TutorProfile::APPROVED])->save();

        return $p;
    }

    public function test_tutors_matching_level_and_goals_come_first_with_a_reason(): void
    {
        $this->tutor('Kids Only', ['kids'], ['Beginner']);
        $this->tutor('Business Pro', ['business'], ['Advanced']);

        $learner = User::factory()->create();
        $learner->learningPreference()->create(['chinese_level' => 'Advanced', 'goals' => ['Business Chinese']]);
        Sanctum::actingAs($learner);

        $this->getJson('/api/tutors/recommended')->assertOk()
            ->assertJsonPath('0.user.name', 'Business Pro')
            ->assertJsonPath('0.match_why', 'Teaches advanced learners, specialises in Business Chinese');
    }

    public function test_podcasts_at_the_learners_level_lead(): void
    {
        $author = User::factory()->create();
        Podcast::forceCreate(['user_id' => $author->id, 'title' => 'Hard one', 'level' => 'Advanced', 'transcript' => '你好']);
        Podcast::forceCreate(['user_id' => $author->id, 'title' => 'Easy one', 'level' => 'Beginner', 'transcript' => '你好']);

        $learner = User::factory()->create();
        $learner->learningPreference()->create(['chinese_level' => 'Complete Beginner']);
        Sanctum::actingAs($learner);

        $this->getJson('/api/podcasts/recommended')->assertOk()
            ->assertJsonPath('0.title', 'Easy one')
            ->assertJsonPath('0.match_why', 'At your level');
    }

    public function test_tutors_open_at_the_learners_study_time_come_first(): void
    {
        $morning = $this->tutor('Morning Tutor', ['kids'], ['Beginner']);
        $morning->forceFill(['timezone' => 'Asia/Phnom_Penh'])->save();
        $morning->availabilitySlots()->create(['day_of_week' => 1, 'start_time' => '08:00', 'end_time' => '10:00']);

        $evening = $this->tutor('Evening Tutor', ['kids'], ['Beginner']);
        // 20:00-22:00 in Shanghai is 19:00-21:00 in Phnom Penh: still evening there.
        $evening->forceFill(['timezone' => 'Asia/Shanghai'])->save();
        $evening->availabilitySlots()->create(['day_of_week' => 1, 'start_time' => '20:00', 'end_time' => '22:00']);

        $learner = User::factory()->create();
        $learner->learningPreference()->create(['study_time' => 'Evening']);
        Sanctum::actingAs($learner);

        $this->getJson('/api/tutors/recommended?tz=Asia/Phnom_Penh')->assertOk()
            ->assertJsonPath('0.user.name', 'Evening Tutor')
            ->assertJsonPath('0.match_why', 'Has evening openings');
    }

    public function test_with_no_preferences_the_list_is_unranked_but_full(): void
    {
        $this->tutor('Anyone', ['kids'], ['Beginner']);
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/tutors/recommended')->assertOk()->assertJsonCount(1);
    }
}
