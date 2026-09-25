<?php

namespace App\Console\Commands;

use App\Models\Article;
use App\Models\Podcast;
use App\Services\ChineseTranslationService;
use Illuminate\Console\Command;

/**
 * Brings translations written before the sentence-by-sentence reader existed
 * into its one-Chinese-line / one-English-line format.
 *
 * Equal sentence counts need no provider call: splitting the existing English
 * onto lines is enough. Only genuinely mismatched legacy passages are sent to
 * the configured server-side translation provider when --refresh-mismatched
 * is deliberately supplied.
 */
class NormalizeLegacyTranslations extends Command
{
    protected $signature = 'content:normalize-translations
                            {--dry-run : Report the work without writing it}
                            {--refresh-mismatched : Re-translate entries whose existing sentence counts do not match}';

    protected $description = 'Normalize legacy podcast and article translations for the paired reader layout';

    public function handle(ChineseTranslationService $translator): int
    {
        $summary = ['normalized' => 0, 'refreshed' => 0, 'skipped' => 0];

        $this->normalize(Podcast::query()->whereNotNull('transcript')->whereNotNull('transcript_en')->cursor(), 'transcript', 'transcript_en', $translator, $summary);
        $this->normalize(Article::query()->whereNotNull('body')->whereNotNull('body_en')->cursor(), 'body', 'body_en', $translator, $summary);

        $this->info(sprintf(
            'Normalized %d, refreshed %d, skipped %d.',
            $summary['normalized'],
            $summary['refreshed'],
            $summary['skipped'],
        ));

        return self::SUCCESS;
    }

    private function normalize(iterable $records, string $sourceField, string $translationField, ChineseTranslationService $translator, array &$summary): void
    {
        foreach ($records as $record) {
            $source = $this->chineseSentences((string) $record->{$sourceField});
            $english = $this->englishSentences((string) $record->{$translationField});

            if (! count($source)) {
                $summary['skipped']++;
                continue;
            }

            $refreshed = false;
            if (! count($english) || count($source) !== count($english)) {
                if (! $this->option('refresh-mismatched')) {
                    $summary['skipped']++;
                    continue;
                }

                $english = $translator->translate($source);
                $refreshed = true;
            }

            $normalized = implode("\n", $english);
            if ($record->{$translationField} === $normalized) {
                continue;
            }

            if (! $this->option('dry-run')) {
                $record->{$translationField} = $normalized;
                $record->save();
            }

            $summary[$refreshed ? 'refreshed' : 'normalized']++;
            $this->line(sprintf('%s #%d %s', class_basename($record), $record->id, $refreshed ? 're-translated' : 'normalized'));
        }
    }

    private function chineseSentences(string $text): array
    {
        return $this->splitSentences($text, '/(?<=[。！？!?])\s*/u');
    }

    private function englishSentences(string $text): array
    {
        return $this->splitSentences($text, '/(?<=[.!?])\s*/u');
    }

    private function splitSentences(string $text, string $punctuationPattern): array
    {
        $sentences = [];
        foreach (preg_split('/\r?\n+/u', trim($text), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $line) {
            foreach (preg_split($punctuationPattern, trim($line), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $sentence) {
                if (trim($sentence) !== '') {
                    $sentences[] = trim($sentence);
                }
            }
        }

        return $sentences;
    }
}
