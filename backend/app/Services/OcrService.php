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
        return $this->read($imagePath)['text'];
    }

    /**
     * The text PLUS the lines the reader was not sure of.
     *
     * `uncertain` holds those lines exactly as they appear in `text` (after
     * tidy), so the page can match them by content. Gemini flags its own with
     * `[?]` (see its prompt); Tesseract has no opinion of its own, so a line
     * whose words average under LOW_CONFIDENCE is flagged from its TSV output.
     *
     * @return array{text: string, uncertain: array<int, string>}
     */
    public function read(string $imagePath): array
    {
        $raw = $this->gemini->extract($imagePath);

        if ($raw !== null) {
            Log::info('Scan read by Gemini', ['chars' => mb_strlen($raw)]);
            $uncertain = [];
            $lines = [];
            foreach (preg_split('/\r\n|\r|\n/u', $raw) as $line) {
                $marker = '/^\s*'.preg_quote(GeminiOcrService::UNSURE, '/').'\s*/u';
                if (preg_match($marker, $line)) {
                    $line = preg_replace($marker, '', $line);
                    $uncertain[] = self::tidy($line);
                }
                $lines[] = $line;
            }

            return $this->result(implode("\n", $lines), $uncertain);
        }

        if (GeminiOcrService::isPdf($imagePath)) {
            throw new \DomainException('Could not read that PDF right now. Try again in a moment, or upload a photo of the page.');
        }

        [$text, $uncertain] = $this->tesseract($imagePath);

        return $this->result($text, $uncertain);
    }

    /** A Tesseract line averaging below this confidence (0-100) is flagged. */
    public const LOW_CONFIDENCE = 60;

    /** Keep only flags that still name a line of the final text. */
    private function result(string $raw, array $uncertain): array
    {
        $text = self::tidy($raw);
        $present = array_flip(preg_split('/\n/u', $text));
        $uncertain = array_values(array_unique(array_filter(
            $uncertain,
            fn ($line) => $line !== '' && isset($present[$line])
        )));

        return ['text' => $text, 'uncertain' => $uncertain];
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

    /**
     * One Tesseract run writing BOTH the plain text (unchanged, what Scan
     * always used) and a TSV with a confidence per word, used only to flag
     * lines. Two outputs from one pass, so the fallback is no slower.
     *
     * @return array{0: string, 1: array<int, string>}
     */
    private function tesseract(string $imagePath): array
    {
        $base = tempnam(sys_get_temp_dir(), 'ocr');
        $process = new Process([
            config('ocr.tesseract_path'),
            $imagePath,
            $base,
            '--tessdata-dir', storage_path('tessdata'),
            '-l', 'chi_sim',
            'txt', 'tsv',
        ]);

        try {
            $process->run();

            if (! $process->isSuccessful()) {
                throw new ProcessFailedException($process);
            }

            $text = trim((string) @file_get_contents($base.'.txt'));
            $tsv = (string) @file_get_contents($base.'.tsv');
        } finally {
            @unlink($base);
            @unlink($base.'.txt');
            @unlink($base.'.tsv');
        }

        return [$text, self::lowConfidenceLines($tsv)];
    }

    /** Lines from Tesseract's TSV whose words average under LOW_CONFIDENCE. */
    public static function lowConfidenceLines(string $tsv): array
    {
        $lines = [];
        foreach (preg_split('/\r\n|\n/', trim($tsv)) as $i => $row) {
            $c = explode("\t", $row);
            // level 5 = a word; skip the header and rows with no text.
            if ($i === 0 || count($c) < 12 || $c[0] !== '5' || trim($c[11]) === '' || (float) $c[10] < 0) {
                continue;
            }
            $key = $c[2].'-'.$c[3].'-'.$c[4];
            $lines[$key]['text'] = ($lines[$key]['text'] ?? '').' '.$c[11];
            $lines[$key]['conf'][] = (float) $c[10];
        }

        $low = [];
        foreach ($lines as $line) {
            if (array_sum($line['conf']) / count($line['conf']) < self::LOW_CONFIDENCE) {
                $low[] = self::tidy($line['text']);
            }
        }

        return $low;
    }
}
