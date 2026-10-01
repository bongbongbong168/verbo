<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ScanListTest extends TestCase
{
    use RefreshDatabase;

    public function test_document_list_returns_only_metadata_for_the_owner()
    {
        $owner = User::factory()->create();
        $scan = $owner->scans()->create([
            'original_filename' => 'page.png',
            'raw_text' => 'A long OCR result that only the detail page needs',
            'words' => [],
            'size_bytes' => 1234,
        ]);
        User::factory()->create()->scans()->create([
            'original_filename' => 'someone-else.png',
            'raw_text' => 'Private text',
            'words' => [],
        ]);

        Sanctum::actingAs($owner);
        $this->getJson('/api/scans')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $scan->id)
            ->assertJsonPath('0.size_bytes', 1234)
            ->assertJsonMissingPath('0.raw_text');
    }
}
