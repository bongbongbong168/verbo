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

            return $text;
        }

        return $this->tesseract($imagePath);
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
