<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;

class OcrService
{
    public function __construct(private GeminiOcrService $gemini)
    {
    }

    /**
     * Gemini first, Tesseract behind it.
     *
     * Gemini reads real phone photos far better than Tesseract's Chinese model,
     * but it is a metered third party sharing a quota with the practice
     * assistant, so it is never the only way in: when it is unavailable for
     * any reason it returns null and the image is read locally instead. Scan
     * therefore works with no key at all, exactly as it did before.
     *
     * Only Tesseract can throw here, so the controller's handling of a failed
     * read is unchanged.
     */
    public function extractChineseText(string $imagePath): string
    {
        $text = $this->gemini->extract($imagePath);

        if ($text !== null) {
            Log::info('Scan read by Gemini', ['chars' => mb_strlen($text)]);
        } else {
            $text = $this->tesseract($imagePath);
        }

        return self::tidy($text);
    }

    /**
     * Chinese only, laid out cleanly - whichever engine read the image.
     *
     * Gemini is ASKED for this in its prompt, but a prompt is a request, not a
     * guarantee, and Tesseract is not asked at all: it returns English lines,
     * stray Latin noise and a space between nearly every character. So the same
     * rules are enforced here on both, deterministically:
     *
     *  - a line with no Han character in it is dropped (English, logos, noise)
     *  - spaces between Chinese characters are removed
     *  - half-width , . : ; ! ? ( ) right after a Chinese character become the
     *    full-width forms Chinese text uses; a dot between digits (3.5元) is
     *    left alone because it does not follow a Han character
     *  - runs of blank lines collapse to one, so paragraphs stay separated
     *    without large gaps opening up
     */
    public static function tidy(string $text): string
    {
        $full = [',' => '，', '.' => '。', ':' => '：', ';' => '；', '!' => '！', '?' => '？', '(' => '（', ')' => '）'];
        $cjk = '\p{Han}\x{3000}-\x{303F}\x{FF00}-\x{FFEF}';

        $lines = [];
        foreach (preg_split('/\r\n|\r|\n/u', $text) as $line) {
            $line = trim(preg_replace('/[ \t\x{3000}]+/u', ' ', $line));

            if ($line === '') {
                $lines[] = '';
                continue;
            }

            if (! preg_match('/\p{Han}/u', $line)) {
                continue;
            }

            // No space between two Chinese characters, or next to Chinese
            // punctuation.
            $line = preg_replace('/(?<=['.$cjk.']) +(?=['.$cjk.'])/u', '', $line);
            // Nor between a Chinese character and a number beside it, which is
            // how prices and counts are written: 宫保鸡丁 38元 -> 宫保鸡丁38元.
            $line = preg_replace('/(?<=\p{Han}) +(?=\d)|(?<=\d) +(?=\p{Han})/u', '', $line);

            // Half-width punctuation straight after a Chinese character.
            $line = preg_replace_callback(
                '/(?<=\p{Han}) ?([,.:;!?()])/u',
                fn ($m) => $full[$m[1]],
                $line
            );

            // An opening bracket straight before a Chinese character.
            $line = preg_replace('/\( ?(?=\p{Han})/u', '（', $line);

            // Full-width punctuation carries its own spacing, so no extra space
            // on either side of it - "价格： 38元" becomes "价格：38元".
            $line = preg_replace('/ +(?=[\x{3000}-\x{303F}\x{FF00}-\x{FFEF}])|(?<=[\x{3000}-\x{303F}\x{FF00}-\x{FFEF}]) +/u', '', $line);

            $lines[] = $line;
        }

        return trim(preg_replace('/\n{3,}/', "\n\n", implode("\n", $lines)));
    }

    private function tesseract(string $imagePath): string
    {
        $process = new Process([
            config('ocr.tesseract_path'),
            $imagePath,
            'stdout',
            '--tessdata-dir', storage_path('tessdata'),
            '-l', 'chi_sim',
        ]);

        $process->run();

        if (! $process->isSuccessful()) {
            throw new ProcessFailedException($process);
        }

        return trim($process->getOutput());
    }
}
