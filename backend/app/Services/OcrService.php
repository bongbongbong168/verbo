<?php

namespace App\Services;

use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;

class OcrService
{
    public function extractChineseText(string $imagePath): string
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
