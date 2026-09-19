<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudyText extends Model
{
    use HasFactory;

    public const VOICES = ['boy', 'girl'];

    protected $fillable = [
        'title',
        'position',
    ];

    protected $casts = [
        'speaker_voices' => 'array',
    ];

    public function unit()
    {
        return $this->belongsTo(StudyUnit::class, 'study_unit_id');
    }

    public function lines()
    {
        return $this->hasMany(StudyTextLine::class)->orderBy('position')->orderBy('id');
    }

    /** Each named speaker once, in the order they first speak. */
    public function speakers(): array
    {
        return $this->lines
            ->pluck('speaker')
            ->map(fn ($s) => trim((string) $s))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    /**
     * 'boy' or 'girl' for a speaker, or null for an unnamed line (it is read
     * in the default voice). A saved choice wins; otherwise speakers alternate
     * boy, girl in the order they first speak, so a two-person dialogue has
     * two voices with nothing set.
     */
    public function voiceFor(?string $speaker): ?string
    {
        $speaker = trim((string) $speaker);
        if ($speaker === '') {
            return null;
        }

        $saved = $this->speaker_voices[$speaker] ?? null;
        if (in_array($saved, self::VOICES, true)) {
            return $saved;
        }

        $index = array_search($speaker, $this->speakers(), true);

        return $index === false || $index % 2 === 0 ? 'boy' : 'girl';
    }
}
