<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfilePhotoSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_avatar_updates_and_removes_the_matching_tutor_photo(): void
    {
        Storage::fake('public');

        $user = User::factory()->create();
        $profile = $user->tutorProfile()->create(['bio' => 'Teaches Mandarin']);

        // A real 1×1 PNG keeps this test independent of PHP's optional GD
        // extension, which the production upload path does not require.
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=');

        $this->actingAs($user, 'sanctum')
            ->post('/api/user/avatar', ['avatar' => UploadedFile::fake()->createWithContent('portrait.png', $png)])
            ->assertOk();

        $user->refresh();
        $profile->refresh();

        $this->assertNotNull($user->avatar_path);
        $this->assertSame($user->avatar_path, $profile->photo_path);
        Storage::disk('public')->assertExists($user->avatar_path);

        $this->actingAs($user, 'sanctum')
            ->delete('/api/user/avatar')
            ->assertOk();

        $this->assertNull($user->fresh()->avatar_path);
        $this->assertNull($profile->fresh()->photo_path);
    }
}
