<?php

namespace Tests\Feature;

use App\Services\PinyinCorrector;
use Tests\TestCase;

/**
 * The pinyin the model writes, checked against the app's own dictionary.
 *
 * The behaviour that matters most is the one that does NOTHING: a reply whose
 * pinyin is already right, or whose shape this does not recognise, has to come
 * through untouched. A corrector that mangles good output is worse than the
 * intermittent error it was added to fix.
 */
class PinyinCorrectorTest extends TestCase
{
    private function fix(string $s): string
    {
        return app(PinyinCorrector::class)->fix($s);
    }

    public function test_it_corrects_a_wrong_tone()
    {
        $out = $this->fix("你好！\nNi hao!\nHello!");

        $this->assertStringContainsString('nǐ hǎo', mb_strtolower($out));
        $this->assertStringNotContainsString('Ni hao', $out);
    }

    /**
     * The dictionary spaces every syllable and the model groups them into
     * words. The model's grouping reads better, so only the tones are checked.
     */
    public function test_it_keeps_the_models_word_grouping_when_the_tones_agree()
    {
        $reply = "你今天怎么样？\nNǐ jīntiān zěnmeyàng?\nHow are you today?";

        $this->assertSame($reply, $this->fix($reply));
    }

    /** An English line under Chinese is not pinyin and must survive. */
    public function test_it_leaves_the_english_translation_alone()
    {
        $reply = "你好！\nHello there!";

        $this->assertSame($reply, $this->fix($reply));
    }

    public function test_it_leaves_prose_with_no_chinese_alone()
    {
        $reply = "Here are some common ways to start a daily chat:";

        $this->assertSame($reply, $this->fix($reply));
    }

    /** A "Pinyin:" label the model wrote is kept. */
    public function test_it_keeps_the_label_and_the_punctuation()
    {
        $out = $this->fix("你好！\nPinyin: Ni hao?\nHello!");

        $this->assertStringContainsString('Pinyin:', $out);
        $this->assertStringContainsString('?', $out);
    }

    /** Several examples in one reply are each checked. */
    public function test_it_walks_every_pair_in_a_longer_reply()
    {
        $out = $this->fix(
            "你好！\nNi hao!\nHello!\n\n你吃了吗？\nNi chi le ma?\nHave you eaten?"
        );

        $lower = mb_strtolower($out);
        $this->assertStringContainsString('nǐ hǎo', $lower);
        $this->assertStringContainsString('chī', $lower);
    }

    /**
     * The bracketed shape — `你好 (Ni hao) - Hello` — which is the one that
     * actually turned up in the report. The model uses both.
     */
    public function test_it_corrects_pinyin_written_in_brackets_on_the_same_line()
    {
        $out = $this->fix('你好！(Ni hao!) - Hello!');

        $this->assertStringContainsString('nǐ hǎo', mb_strtolower($out));
        $this->assertStringContainsString('- Hello!', $out);
    }

    public function test_it_handles_full_width_brackets()
    {
        $out = $this->fix('你好！（Ni hao!）- Hello!');

        $this->assertStringContainsString('nǐ hǎo', mb_strtolower($out));
    }

    /** A bracket holding a note rather than pinyin must survive untouched. */
    public function test_it_leaves_a_bracketed_note_alone()
    {
        $reply = '你吃了吗？(a very common friendly greeting) - Have you eaten?';

        $this->assertSame($reply, $this->fix($reply));
    }

    /** Nothing to compare against means nothing is touched. */
    public function test_a_chinese_line_with_no_pinyin_under_it_is_untouched()
    {
        $reply = "你好！\n\n你今天怎么样？";

        $this->assertSame($reply, $this->fix($reply));
    }
}
