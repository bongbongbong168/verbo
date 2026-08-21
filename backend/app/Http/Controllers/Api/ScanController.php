<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Scan;
use App\Services\DictionaryService;
use App\Services\OcrService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ScanController extends Controller
{
    public function index(Request $request)
    {
        // share_token rides along so the Documents table can show which scans
        // are public. Safe here: this endpoint only ever returns the caller's
        // own rows.
        return $request->user()->scans()->latest()->get([
            'id', 'original_filename', 'raw_text', 'size_bytes', 'created_at', 'share_token',
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

    /**
     * Turn on public sharing and hand back the link.
     *
     * The token is the ONLY thing protecting the scan once this is on, so it is
     * 40 random chars from a CSPRNG — long enough that guessing is not a threat
     * model. Idempotent: sharing an already-shared scan returns the existing
     * link rather than rotating it, so a link already sent to someone does not
     * silently die when the owner clicks Share again.
     */
    public function share(Request $request, Scan $scan)
    {
        if ((int) $scan->user_id !== $request->user()->id) {
            abort(403);
        }

        if (! $scan->share_token) {
            $scan->update(['share_token' => Str::random(40)]);
        }

        return response()->json(['share_token' => $scan->share_token]);
    }

    /**
     * Revoke the link. Clearing the token immediately breaks every copy of it
     * that is already out there, which is the point.
     */
    public function unshare(Request $request, Scan $scan)
    {
        if ((int) $scan->user_id !== $request->user()->id) {
            abort(403);
        }

        $scan->update(['share_token' => null]);

        return response()->json(['message' => 'Sharing stopped']);
    }

    /**
     * The public read. No auth — the token IS the credential.
     *
     * Deliberately hand-built rather than $scan->toArray(): this response goes
     * to anyone on the internet holding the link, so it must never carry
     * user_id, the token itself, or anything else about the owner. Only the
     * scanned content the owner chose to publish.
     */
    public function shared(string $token, DictionaryService $dictionary)
    {
        $scan = Scan::where('share_token', $token)->firstOrFail();

        return response()->json([
            'original_filename' => $scan->original_filename,
            'raw_text' => $scan->raw_text,
            'words' => $scan->words,
            'created_at' => $scan->created_at,
            'tokens' => $scan->raw_text ? $dictionary->annotate($scan->raw_text) : [],
        ]);
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
