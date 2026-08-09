<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Scan;
use App\Services\DictionaryService;
use App\Services\OcrService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ScanController extends Controller
{
    public function index(Request $request)
    {
        return $request->user()->scans()->latest()->get([
            'id', 'original_filename', 'raw_text', 'size_bytes', 'created_at',
        ]);
    }

    public function show(Request $request, Scan $scan, DictionaryService $dictionary)
    {
        if ((int) $scan->user_id !== $request->user()->id) {
            abort(403);
        }

        // Same annotate() the Read/Podcast/Study detail endpoints run, so the
        // scanned text gets the identical hover + Alt+1 treatment. Results are
        // cached forever by md5, so reopening a scan costs nothing.
        // array_merge, not spread — PHP 8.0 cannot unpack string-keyed arrays.
        return array_merge(
            $scan->toArray(),
            ['tokens' => $scan->raw_text ? $dictionary->annotate($scan->raw_text) : []]
        );
    }

    public function destroy(Request $request, Scan $scan)
    {
        // Same (int) cast as show() — SQLite hands back the FK as a string, and
        // a bare !== would 403 the rightful owner.
        if ((int) $scan->user_id !== $request->user()->id) {
            abort(403);
        }

        // No file cleanup: store() already deletes the upload once OCR is done,
        // so the row is all that persists.
        $scan->delete();

        return response()->json(['message' => 'Deleted']);
    }

    public function store(Request $request, OcrService $ocr, DictionaryService $dictionary)
    {
        $request->validate([
            'image' => ['required', 'image', 'max:10240'],
        ]);

        $originalFilename = $request->file('image')->getClientOriginalName();
        // Read before OCR — the upload is deleted in the finally below, so this
        // is the only chance to record how big it was.
        $sizeBytes = $request->file('image')->getSize();
        $path = $request->file('image')->store('scans');
        $fullPath = storage_path('app/'.$path);

        try {
            $text = $ocr->extractChineseText($fullPath);
        } finally {
            Storage::delete($path);
        }

        $words = collect($dictionary->segment($text))
            ->map(fn (string $word) => [
                'word' => $word,
                'pinyin' => $dictionary->pinyinFor($word),
                'translation' => $dictionary->lookup($word),
            ])
            ->values();

        $scan = $request->user()->scans()->create([
            'original_filename' => $originalFilename,
            'raw_text' => $text,
            'words' => $words,
            'size_bytes' => $sizeBytes,
        ]);

        return response()->json($scan, 201);
    }
}
