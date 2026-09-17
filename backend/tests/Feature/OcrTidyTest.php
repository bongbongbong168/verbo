<?php

namespace Tests\Feature;

use App\Services\OcrService;
use Tests\TestCase;

/**
 * The layout step every scan passes through, whichever engine read it.
 */
class OcrTidyTest extends TestCase
{
    public function test_english_only_lines_are_dropped(): void
    {
        $this->assertSame(
            "欢迎光临\n今日特价：宫保鸡丁38元",
            OcrService::tidy("欢迎光临\nOpen 10:00 - 22:00\n今日特价：宫保鸡丁38元\nwww.example.com")
        );
    }

    public function test_spaces_between_chinese_characters_are_removed(): void
    {
        $this->assertSame('你好，我是小明。', OcrService::tidy('你 好 ， 我 是 小 明 。'));
    }

    public function test_half_width_punctuation_after_chinese_becomes_full_width(): void
    {
        $this->assertSame('价格：38元！真的吗？', OcrService::tidy('价格: 38元! 真的吗?'));
    }

    public function test_a_decimal_point_between_digits_is_left_alone(): void
    {
        $this->assertSame('每斤3.5元', OcrService::tidy('每斤3.5元'));
    }

    public function test_brackets_around_chinese_become_full_width(): void
    {
        $this->assertSame('北京（首都）', OcrService::tidy('北京(首都)'));
    }

    public function test_paragraph_gaps_collapse_to_one_blank_line(): void
    {
        $this->assertSame("第一段\n\n第二段", OcrService::tidy("第一段\n\n\n\n第二段"));
    }

    public function test_no_space_between_chinese_and_a_number(): void
    {
        $this->assertSame('宫保鸡丁38元', OcrService::tidy('宫保鸡丁 38 元'));
    }

    public function test_text_with_no_chinese_becomes_empty(): void
    {
        $this->assertSame('', OcrService::tidy("Join us!\nStart your journey"));
    }
}
