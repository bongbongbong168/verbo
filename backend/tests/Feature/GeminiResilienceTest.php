<?php

namespace Tests\Feature;

use App\Models\Article;
use App\Models\ContentQuiz;
use App\Models\LearningPreference;
use App\Models\Scan;
use App\Models\User;
use App\Services\ContentQuizService;
use App\Services\GeminiHttp;
use App\Services\GeminiOcrService;
use App\Services\OcrService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Retry rules, friendly failures, OCR review and the content quiz.
 * Every Google call is faked - the suite spends no quota.
 */
class GeminiResilienceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'gemini-3-flash-preview', 'services.gemini.retries' => 1]);
    }

    private function user(array $extra = []): User
    {
        return User::create(array_merge([
            'name' => 'Mei', 'email' => uniqid().'@example.test', 'password' => bcrypt('x'),
        ], $extra));
    }

    private function reply(string $text): array
    {
        return ['candidates' => [['content' => ['parts' => [['text' => $text]]], 'finishReason' => 'STOP']]];
    }

    // ---- retry rule ------------------------------------------------------

    public function test_a_503_is_retried_once_and_then_succeeds()
    {
        Http::fakeSequence('generativelanguage.googleapis.com/*')
            ->push('down', 503)
            ->push($this->reply('ok'));

        $response = GeminiHttp::generate('m', ['contents' => []], 5);

        $this->assertTrue($response->successful());
        Http::assertSentCount(2);
    }

    public function test_a_429_is_never_retried()
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response('quota', 429)]);

        $this->assertSame(429, GeminiHttp::generate('m', ['contents' => []], 5)->status());
        Http::assertSentCount(1);
    }

    public function test_retries_are_bounded()
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response('down', 503)]);

        GeminiHttp::generate('m', ['contents' => []], 5);

        Http::assertSentCount(2); // one try + one retry, never more
    }

    // ---- chat ------------------------------------------------------------

    public function test_a_rate_limited_chat_gets_a_friendly_message_and_no_provider_detail()
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response('{"error":"RESOURCE_EXHAUSTED key AIzaSyXX"}', 429)]);

        $res = $this->actingAs($this->user())
            ->postJson('/api/practice-chat', ['messages' => [['role' => 'user', 'text' => '你好']]])
            ->assertStatus(503);

        $this->assertStringContainsString('busy', $res->json('message'));
        $this->assertStringNotContainsString('AIza', $res->getContent());
        $this->assertStringNotContainsString('RESOURCE_EXHAUSTED', $res->getContent());
    }

    public function test_chat_sends_only_the_level_label_and_the_recent_turns()
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response($this->reply('好！'))]);
        $user = $this->user(['email' => 'private-address@example.test']);
        $user->learningPreference()->create(['hsk_level' => 3]);

        $messages = [];
        for ($i = 0; $i < 11; $i++) {
            $messages[] = ['role' => $i % 2 ? 'model' : 'user', 'text' => "turn {$i}"];
        }

        $this->actingAs($user)->postJson('/api/practice-chat', ['messages' => $messages])->assertOk();

        Http::assertSent(function (Request $request) {
            $body = json_encode($request->data(), JSON_UNESCAPED_UNICODE);

            return str_contains($body, 'HSK 3')
                && ! str_contains($body, 'private-address')
                && ! str_contains($body, 'Mei')
                && count($request['contents']) === 8
                && $request['contents'][0]['parts'][0]['text'] === 'turn 3';
        });
    }

    // ---- OCR ------------------------------------------------------------

    public function test_lines_gemini_marks_unsure_are_returned_without_the_marker()
    {
        $gemini = $this->createMock(GeminiOcrService::class);
        $gemini->method('extract')->willReturn("今天天气很好\n[?] 我们去公圆玩\n明天见");
        $ocr = new OcrService($gemini);

        $read = $ocr->read('unused.jpg');

        $this->assertSame("今天天气很好\n我们去公圆玩\n明天见", $read['text']);
        $this->assertSame(['我们去公圆玩'], $read['uncertain']);
    }

    public function test_tesseract_lines_under_the_confidence_floor_are_flagged()
    {
        $tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
            ."5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t95\t你好\n"
            ."5\t1\t1\t1\t2\t1\t0\t0\t1\t1\t31\t谢\n"
            ."5\t1\t1\t1\t2\t2\t0\t0\t1\t1\t40\t谢\n";

        $this->assertSame(['谢谢'], OcrService::lowConfidenceLines($tsv));
    }

    public function test_the_owner_can_correct_unsure_lines_and_the_flags_clear()
    {
        $owner = $this->user();
        $scan = $owner->scans()->create([
            'original_filename' => 'a.jpg', 'raw_text' => "你好\n我们去公圆玩", 'words' => [],
            'uncertain_lines' => ['我们去公圆玩'],
        ]);

        $this->actingAs($this->user())->putJson("/api/scans/{$scan->id}/text", ['raw_text' => '改'])->assertForbidden();

        $this->actingAs($owner)
            ->putJson("/api/scans/{$scan->id}/text", ['raw_text' => "你好\n我们去公园玩"])
            ->assertOk()
            ->assertJsonPath('raw_text', "你好\n我们去公园玩")
            ->assertJsonPath('uncertain_lines', []);
    }

    // ---- content quiz ------------------------------------------------------

    private function quizJson(): string
    {
        $q = ['type' => 'comprehension', 'question' => 'Where did they go?', 'options' => ['Park', 'Shop', 'School', 'Home'], 'answer' => 0, 'explanation' => 'The text says 公园.'];

        return json_encode(['questions' => [$q, $q, $q, $q, $q]]);
    }

    private function article(array $extra = []): Article
    {
        $author = $this->user(['is_admin' => true]);

        return Article::create(array_merge([
            'user_id' => $author->id, 'title' => 'Park', 'type' => 'article', 'body' => '我们去公园玩。',
        ], $extra));
    }

    public function test_viewing_never_generates_and_the_quiz_is_made_once()
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response($this->reply($this->quizJson()))]);
        $article = $this->article();
        $learner = $this->user();

        $this->actingAs($learner)->getJson("/api/articles/{$article->id}/quiz")->assertOk()->assertJsonPath('quiz', null);
        Http::assertNothingSent();

        $this->actingAs($learner)->postJson("/api/articles/{$article->id}/quiz")->assertOk()->assertJsonCount(5, 'quiz');
        $this->actingAs($this->user())->postJson("/api/articles/{$article->id}/quiz")->assertOk();
        $this->actingAs($learner)->getJson("/api/articles/{$article->id}/quiz")->assertJsonCount(5, 'quiz');

        Http::assertSentCount(1);
        $this->assertSame(1, ContentQuiz::count());
    }

    public function test_a_malformed_quiz_is_refused_and_nothing_is_saved()
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response($this->reply('{"questions":[{"question":"?"}]}'))]);
        $article = $this->article();

        $this->actingAs($this->user())->postJson("/api/articles/{$article->id}/quiz")
            ->assertStatus(503)
            ->assertJsonPath('message', 'Could not make a quiz right now. Please try again in a moment.');

        $this->assertSame(0, ContentQuiz::count());
    }

    public function test_a_premium_piece_keeps_its_quiz_locked()
    {
        Http::fake();
        $article = $this->article(['is_premium' => true]);

        $this->actingAs($this->user())->postJson("/api/articles/{$article->id}/quiz")->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_the_parser_rejects_a_wrong_option_count()
    {
        $this->assertNull(ContentQuizService::parse('{"questions":[{"question":"q","options":["a","b"],"answer":0}]}'));
    }
}
