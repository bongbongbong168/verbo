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
        return $request->user()->scans()->latest()->get(['id', 'original_filename', 'raw_text', 'created_at']);
    }

    public function show(Request $request, Scan $scan)
    {
        if ((int) $scan->user_id !== $request->user()->id) {
            abort(403);
        }

        return $scan;
    }

    public function store(Request $request, OcrService $ocr, DictionaryService $dictionary)
    {
        $request->validate([
            'image' => ['required', 'image', 'max:10240'],
        ]);

        $originalFilename = $request->file('image')->getClientOriginalName();
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
        ]);

        return response()->json($scan, 201);
    }
}
