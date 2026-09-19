<?php

namespace Tests\Feature;

use App\Models\StudyLevel;
use App\Models\User;
use App\Services\SpeechService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StudySpeechTest extends TestCase
{
    use RefreshDatabase;

    private function unitWithContent(): array
    {
        $author = User::factory()->create(['is_admin' => true]);
        $level = StudyLevel::forceCreate(['user_id' => $author->id, 'title' => 'HSK 1', 'category' => 'hsk']);
        $unit = $level->units()->forceCreate(['title' => 'Unit 1']);
        $word = $unit->vocabulary()->forceCreate(['hanzi' => '机场', 'pinyin' => 'jīchǎng', 'translation' => 'airport']);
        $text = $unit->texts()->forceCreate(['title' => 'At the airport']);
        $line = $text->lines()->forceCreate(['chinese' => '我们去机场接你。', 'position' => 1]);

        return [$unit, $word, $line];
    }

    /** Half a second of silence, a burst of "speech", then silence again. */
    private function fakePcm(): string
    {
        $quiet = str_repeat(pack('s', 0), 12000);
        $loud = str_repeat(pack('s', 8000).pack('s', -8000), 3000);

        return $quiet.$loud.$quiet;
    }

    private function fakeGemini(): void
    {
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [['content' => ['parts' => [[
                    'inlineData' => ['mimeType' => 'audio/L16;codec=pcm;rate=24000', 'data' => base64_encode($this->fakePcm())],
                ]]]]],
            ]),
        ]);
    }

    public function test_a_word_is_made_once_then_served_as_a_file(): void
    {
        Storage::fake('public');
        config(['services.gemini.key' => 'test-key-123']);
        $this->fakeGemini();
        [$unit, $word] = $this->unitWithContent();
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/study-units/{$unit->id}")
            ->assertJsonPath('speech_available', true)
            ->assertJsonPath('vocabulary.0.audio_url', null);

        $url = $this->postJson('/api/study-speech', ['kind' => 'word', 'id' => $word->id])
            ->assertOk()->json('url');
        $this->assertStringContainsString('/storage/speech/', $url);

        // A real WAV, and trimmed: 1s of silence went in around 0.25s of sound.
        $files = Storage::disk('public')->files('speech');
        $this->assertCount(1, $files);
        $wav = Storage::disk('public')->get($files[0]);
        $this->assertSame('RIFF', substr($wav, 0, 4));
        $this->assertSame('WAVE', substr($wav, 8, 4));
        $this->assertLessThan(strlen($this->fakePcm()) / 2, strlen($wav));

        // Now it rides along in the unit payload, and asking again costs nothing.
        $this->getJson("/api/study-units/{$unit->id}")->assertJsonPath('vocabulary.0.audio_url', $url);
        $this->postJson('/api/study-speech', ['kind' => 'word', 'id' => $word->id])->assertOk()->assertJsonPath('url', $url);
        Http::assertSentCount(1);
    }

    public function test_the_key_goes_in_a_header_and_the_text_is_the_rows(): void
    {
        Storage::fake('public');
        config(['services.gemini.key' => 'test-key-123']);
        $this->fakeGemini();
        [, , $line] = $this->unitWithContent();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/study-speech', ['kind' => 'line', 'id' => $line->id])->assertOk();

        Http::assertSent(function (HttpRequest $request) {
            return $request->hasHeader('x-goog-api-key', 'test-key-123')
                && ! str_contains($request->url(), 'test-key-123')
                && str_contains($request->url(), 'tts')
                && str_contains($request['contents'][0]['parts'][0]['text'], '我们去机场接你。')
                && $request['generationConfig']['responseModalities'] === ['AUDIO'];
        });
    }

    public function test_only_published_rows_can_be_spoken(): void
    {
        Storage::fake('public');
        config(['services.gemini.key' => 'test-key-123']);
        $this->fakeGemini();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/study-speech', ['kind' => 'word', 'id' => 999])->assertNotFound();
        $this->postJson('/api/study-speech', ['kind' => 'anything', 'id' => 1])->assertStatus(422);
        $this->postJson('/api/study-speech', ['text' => 'spend your quota'])->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_a_refusal_or_no_key_falls_back_quietly(): void
    {
        Storage::fake('public');
        [$unit, $word] = $this->unitWithContent();
        Sanctum::actingAs(User::factory()->create());

        config(['services.gemini.key' => 'test-key-123']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['error' => ['message' => 'quota']], 429)]);
        $this->postJson('/api/study-speech', ['kind' => 'word', 'id' => $word->id])
            ->assertStatus(503)
            ->assertJsonMissing(['error' => ['message' => 'quota']]);
        $this->assertCount(0, Storage::disk('public')->files('speech'));

        config(['services.gemini.key' => null]);
        $this->getJson("/api/study-units/{$unit->id}")->assertJsonPath('speech_available', false);
        $this->postJson('/api/study-speech', ['kind' => 'word', 'id' => $word->id])->assertStatus(503);
    }

    public function test_speakers_get_a_boy_and_a_girl_voice_and_it_can_be_changed(): void
    {
        Storage::fake('public');
        config([
            'services.gemini.key' => 'test-key-123',
            'services.gemini.tts_voice' => 'Teacher',
            'services.gemini.tts_voice_boy' => 'BoyVoice',
            'services.gemini.tts_voice_girl' => 'GirlVoice',
        ]);
        $this->fakeGemini();
        [$unit, , $first] = $this->unitWithContent();
        $text = $first->text;
        $first->forceFill(['speaker' => '小明'])->save();
        $reply = $text->lines()->forceCreate(['speaker' => '安娜', 'chinese' => '谢谢你！', 'position' => 2]);
        $admin = User::factory()->create(['is_admin' => true]);
        Sanctum::actingAs($admin);

        // By default they alternate in the order they first speak.
        $this->getJson("/api/study-units/{$unit->id}")
            ->assertJsonPath('texts.0.speakers.0', ['name' => '小明', 'voice' => 'boy'])
            ->assertJsonPath('texts.0.speakers.1', ['name' => '安娜', 'voice' => 'girl']);

        $this->postJson('/api/study-speech', ['kind' => 'line', 'id' => $reply->id])->assertOk();
        Http::assertSent(fn (HttpRequest $r) => data_get($r->data(), 'generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName') === 'GirlVoice');

        // Swapped by an admin; a name that is not in the conversation is dropped.
        $this->putJson("/api/study-texts/{$text->id}/voices", ['voices' => ['小明' => 'girl', '安娜' => 'boy', 'Nobody' => 'boy']])
            ->assertOk()
            ->assertJsonPath('speakers.0.voice', 'girl');
        $this->assertSame(['小明' => 'girl', '安娜' => 'boy'], $text->fresh()->speaker_voices);

        // The girl's clip no longer matches, so the line has no audio yet.
        $this->getJson("/api/study-units/{$unit->id}")->assertJsonPath('texts.0.lines.1.audio_url', null);

        $this->putJson("/api/study-texts/{$text->id}/voices", ['voices' => ['小明' => 'robot']])->assertStatus(422);
        Sanctum::actingAs(User::factory()->create());
        $this->putJson("/api/study-texts/{$text->id}/voices", ['voices' => []])->assertForbidden();
    }

    public function test_a_429_pauses_requests_until_the_wait_is_over(): void
    {
        Storage::fake('public');
        config(['services.gemini.key' => 'test-key-123']);
        [$unit, $word, $line] = $this->unitWithContent();
        Sanctum::actingAs(User::factory()->create());
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(
            ['error' => ['message' => 'Quota exceeded, limit: 3. Please retry in 36.3s.']],
            429,
        )]);

        $this->postJson('/api/study-speech', ['kind' => 'word', 'id' => $word->id])->assertStatus(503);
        $this->postJson('/api/study-speech', ['kind' => 'line', 'id' => $line->id])->assertStatus(503);
        Http::assertSentCount(1);
        $this->assertTrue(SpeechService::coolingDown());

        $this->travel(40)->seconds();
        $this->assertFalse(SpeechService::coolingDown());
    }

    public function test_the_wav_header_is_well_formed(): void
    {
        $wav = SpeechService::wav(str_repeat("\0\0", 100), 24000);
        $this->assertSame(244, strlen($wav));
        $this->assertSame(24000, unpack('V', substr($wav, 24, 4))[1]);
        $this->assertSame(200, unpack('V', substr($wav, 40, 4))[1]);
    }
}
