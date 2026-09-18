<?php

namespace Tests\Feature;

use App\Models\Podcast;
use App\Models\User;
use App\Services\TimedTranscriptBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use InvalidArgumentException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The synced podcast transcript: building it from the transcriber's
 * character timings, and the endpoints that import and serve it.
 */
class PodcastTimedTranscriptTest extends TestCase
{
    use RefreshDatabase;

    /** A transcriber file for one window, every character timed 0.1s apart. */
    private function raw(string $text, array $untimed = []): array
    {
        $chars = [];
        $t = 1.0;
        foreach (mb_str_split($text) as $i => $ch) {
            $timed = ! in_array($i, $untimed, true) && preg_match('/\p{Han}/u', $ch);
            $chars[] = [
                'char' => $ch,
                'start' => $timed ? round($t, 3) : null,
                'end' => $timed ? round($t + 0.1, 3) : null,
                'score' => $timed ? 0.9 : null,
            ];
            $t += 0.1;
        }

        return [
            'version' => 1,
            'language' => 'zh',
            'model' => 'large-v3',
            'duration' => 60,
            'segments' => [['start' => 1.0, 'end' => $t, 'text' => $text, 'chars' => $chars]],
        ];
    }

    private function words(array $transcript): array
    {
        return collect($transcript['segments'])
            ->flatMap(fn ($s) => $s['words'])
            ->where('type', 'word')
            ->values()
            ->all();
    }

    private function podcast(): Podcast
    {
        $owner = User::factory()->create(['is_admin' => true]);

        return $owner->podcasts()->create(['title' => 'Test', 'transcript' => '你好']);
    }

    public function test_characters_are_grouped_into_dictionary_words_with_their_span(): void
    {
        $words = $this->words(app(TimedTranscriptBuilder::class)->build($this->raw('今天学习中文')));

        $this->assertSame(['今天', '学习', '中文'], array_column($words, 'text'));
        // 学习 is characters 2 and 3: 1.2 -> 1.4.
        $this->assertSame(1.2, $words[1]['start']);
        $this->assertSame(1.4, $words[1]['end']);
        $this->assertSame('xué xí', $words[1]['pinyin']);
        $this->assertNotNull($words[1]['translation']);
    }

    public function test_a_window_is_cut_into_sentences_with_full_width_punctuation(): void
    {
        $built = app(TimedTranscriptBuilder::class)->build($this->raw('你好,我是老师。你呢?'));

        $this->assertSame(['你好，我是老师。', '你呢？'], array_column($built['segments'], 'text'));
        $this->assertSame(1.0, $built['segments'][0]['start']);
        $this->assertSame(1.8, $built['segments'][1]['start']);
    }

    public function test_an_untimed_word_borrows_the_gap_between_its_neighbours(): void
    {
        // 学习 (chars 2-3) lost its timings; 今天 ends 1.2, 中文 starts 1.4.
        $words = $this->words(app(TimedTranscriptBuilder::class)->build($this->raw('今天学习中文', [2, 3])));

        $this->assertSame(1.2, $words[1]['start']);
        $this->assertSame(1.4, $words[1]['end']);
        $this->assertTrue($words[1]['estimated']);
        $this->assertArrayNotHasKey('estimated', $words[0]);
    }

    public function test_a_word_missing_from_the_dictionary_keeps_its_text_and_time(): void
    {
        // 㐀 is a real Han character with no CC-CEDICT entry.
        $words = $this->words(app(TimedTranscriptBuilder::class)->build($this->raw('你好㐀')));
        $odd = collect($words)->firstWhere('text', '㐀');

        $this->assertNotNull($odd);
        $this->assertNull($odd['translation']);
        $this->assertNotNull($odd['start']);
    }

    public function test_a_file_that_is_not_a_transcript_is_refused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        app(TimedTranscriptBuilder::class)->build(['version' => 1, 'segments' => []]);
    }

    public function test_an_admin_imports_a_file_and_a_listener_reads_it(): void
    {
        $podcast = $this->podcast();
        Sanctum::actingAs(User::where('is_admin', true)->first());

        $file = UploadedFile::fake()->createWithContent('episode.timed.json', json_encode($this->raw('今天学习中文。')));
        $this->post("/api/podcasts/{$podcast->id}/timed-transcript", ['file' => $file], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('status', 'completed')
            ->assertJsonPath('stats.words', 3);

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/podcasts/{$podcast->id}/timed-transcript")
            ->assertOk()
            ->assertJsonPath('status', 'completed')
            ->assertJsonPath('segments.0.text', '今天学习中文。')
            // Admin diagnostics stay admin-only.
            ->assertJsonMissingPath('error')
            ->assertJsonMissingPath('stats');
    }

    public function test_the_episode_payload_does_not_carry_the_transcript(): void
    {
        $podcast = $this->podcast();
        $podcast->saveTimedTranscript(app(TimedTranscriptBuilder::class)->build($this->raw('你好')));

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/podcasts/{$podcast->id}")
            ->assertOk()
            ->assertJsonPath('timed_transcript_status', 'completed')
            ->assertJsonMissingPath('timed_transcript');
    }

    public function test_a_listener_cannot_import_or_remove_one(): void
    {
        $podcast = $this->podcast();
        Sanctum::actingAs(User::factory()->create());

        $file = UploadedFile::fake()->createWithContent('x.json', json_encode($this->raw('你好')));
        $this->post("/api/podcasts/{$podcast->id}/timed-transcript", ['file' => $file], ['Accept' => 'application/json'])
            ->assertForbidden();
        $this->deleteJson("/api/podcasts/{$podcast->id}/timed-transcript")->assertForbidden();
    }

    public function test_a_bad_file_is_refused_and_the_existing_transcript_survives(): void
    {
        $podcast = $this->podcast();
        $podcast->saveTimedTranscript(app(TimedTranscriptBuilder::class)->build($this->raw('你好')));
        Sanctum::actingAs(User::where('is_admin', true)->first());

        $junk = UploadedFile::fake()->createWithContent('x.json', '{"version": 1, "segments": "nope"}');
        $this->post("/api/podcasts/{$podcast->id}/timed-transcript", ['file' => $junk], ['Accept' => 'application/json'])
            ->assertStatus(422);

        $notJson = UploadedFile::fake()->createWithContent('x.txt', 'hello');
        $this->post("/api/podcasts/{$podcast->id}/timed-transcript", ['file' => $notJson], ['Accept' => 'application/json'])
            ->assertStatus(422);

        $this->assertSame('completed', $podcast->fresh()->timed_transcript_status);
    }

    public function test_removing_resets_the_episode_to_not_processed(): void
    {
        $podcast = $this->podcast();
        $podcast->saveTimedTranscript(app(TimedTranscriptBuilder::class)->build($this->raw('你好')));
        Sanctum::actingAs(User::where('is_admin', true)->first());

        $this->deleteJson("/api/podcasts/{$podcast->id}/timed-transcript")
            ->assertOk()
            ->assertJsonPath('status', 'not_processed')
            ->assertJsonPath('segments', []);
    }

    public function test_editing_a_line_keeps_the_timing_of_the_words_that_stay(): void
    {
        $podcast = $this->podcast();
        $podcast->saveTimedTranscript(app(TimedTranscriptBuilder::class)->build($this->raw('今天Mommy学习中文。')));
        Sanctum::actingAs(User::where('is_admin', true)->first());

        $before = collect($this->words($podcast->fresh()->timed_transcript))->keyBy('text');

        $this->patchJson("/api/podcasts/{$podcast->id}/timed-transcript", ['lines' => [['index' => 0, 'text' => '今天学习中文。']]])
            ->assertOk()
            ->assertJsonPath('segments.0.text', '今天学习中文。');

        $after = collect($this->words($podcast->fresh()->timed_transcript))->keyBy('text');
        $this->assertSame(['今天', '学习', '中文'], $after->keys()->all());
        foreach (['今天', '学习', '中文'] as $w) {
            $this->assertSame($before[$w]['start'], $after[$w]['start']);
            $this->assertSame($before[$w]['end'], $after[$w]['end']);
        }
    }

    public function test_an_added_word_is_estimated_and_an_empty_line_is_deleted(): void
    {
        $podcast = $this->podcast();
        $podcast->saveTimedTranscript(app(TimedTranscriptBuilder::class)->build($this->raw('今天中文。你好。')));
        Sanctum::actingAs(User::where('is_admin', true)->first());

        $this->patchJson("/api/podcasts/{$podcast->id}/timed-transcript", ['lines' => [
            ['index' => 0, 'text' => '今天学习中文。'],
            ['index' => 1, 'text' => ''],
        ]])->assertOk();

        $t = $podcast->fresh()->timed_transcript;
        $this->assertCount(1, $t['segments']);
        $learn = collect($this->words($t))->firstWhere('text', '学习');
        $this->assertTrue($learn['estimated']);
        $this->assertNotNull($learn['start']);
    }

    public function test_a_listener_cannot_edit_lines(): void
    {
        $podcast = $this->podcast();
        $podcast->saveTimedTranscript(app(TimedTranscriptBuilder::class)->build($this->raw('你好。')));
        Sanctum::actingAs(User::factory()->create());

        $this->patchJson("/api/podcasts/{$podcast->id}/timed-transcript", ['lines' => [['index' => 0, 'text' => '']]])
            ->assertForbidden();
    }

    public function test_the_episode_form_cannot_write_the_status(): void
    {
        $podcast = $this->podcast();
        $podcast->update(['timed_transcript_status' => 'completed', 'timed_transcript' => ['x' => 1]]);

        $this->assertSame('not_processed', $podcast->fresh()->timed_transcript_status);
    }
}
