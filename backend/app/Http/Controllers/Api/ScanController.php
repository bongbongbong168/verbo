<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Scan;
use App\Services\DictionaryService;
use App\Services\OcrService;
use App\Services\UsageAllowanceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Exception\ProcessFailedException;
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

    public function show(Request $request, Scan $scan, DictionaryService $dictionary, UsageAllowanceService $allowances)
    {
        if ((int) $scan->user_id !== $request->user()->id) {
            abort(403);
        }

        // Same annotate() the Read/Podcast/Study detail endpoints run, so the
        // scanned text gets the identical hover + Alt+1 treatment. Results are
        // cached forever by md5, so reopening a scan costs nothing.
        // array_merge, not spread — PHP 8.0 cannot unpack string-keyed arrays.
        $translationKey = 'scan-translation:v3:'.$scan->user_id.':'.$scan->id.':'.hash('sha256', trim((string) $scan->raw_text));

        return array_merge(
            $scan->toArray(),
            [
                'tokens' => $scan->raw_text ? $dictionary->annotate($scan->raw_text) : [],
                'translation_cached' => Cache::has($translationKey),
                'translation_usage' => $allowances->summary($request->user(), UsageAllowanceService::TRANSLATIONS),
            ]
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

    public function store(Request $request, OcrService $ocr, DictionaryService $dictionary, UsageAllowanceService $allowances)
    {
        $request->validate([
            'image' => ['required', 'image', 'max:10240'],
        ]);

        $reservation = $allowances->reserve($request->user(), UsageAllowanceService::SCANS);
        $consumed = false;
        $originalFilename = $request->file('image')->getClientOriginalName();
        // Read before OCR — the upload is deleted in the finally below, so this
        // is the only chance to record how big it was.
        $sizeBytes = $request->file('image')->getSize();
        /* THE DISK IS NAMED, and leaving it to the default is what broke Scan in
           production outright. `FILESYSTEM_DISK` is `public` on the deployed
           service, so this wrote to storage/app/PUBLIC/scans while the line
           below built the path as storage/app/scans — tesseract was handed a
           file that was never there, and every upload came back "Could not read
           that image. Try a clearer photo", whatever the photo. Read from the
           production log, which said plainly: cannot read input file ... No such
           file or directory.

           `local` is also the only correct disk here on its own merits: this is
           someone's private photograph, and the public disk is published at
           /storage/... with nothing in front of it. */
        $path = $request->file('image')->store('scans', 'local');
        $fullPath = storage_path('app/'.$path);

        try {
            $text = $ocr->extractChineseText($fullPath);
        } catch (ProcessFailedException $e) {
            // ProcessFailedException stringifies the whole command line —
            // the tesseract binary path, --tessdata-dir and the upload's
            // absolute path — and Laravel would hand all of that to the client
            // as a 500. Log it for us, tell the user something useful.
            Log::error('OCR failed', ['message' => $e->getMessage()]);

            $allowances->release($request->user(), UsageAllowanceService::SCANS, $reservation);
            return response()->json([
                'message' => 'Could not read that image. Try a clearer photo, or one with more contrast.',
            ], 422);
        } catch (\Throwable $e) {
            $allowances->release($request->user(), UsageAllowanceService::SCANS, $reservation);
            throw $e;
        } finally {
            Storage::disk('local')->delete($path);
        }

        try {
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

            $usage = $allowances->commit($request->user(), UsageAllowanceService::SCANS, $reservation);
            $consumed = true;

            return response()->json(array_merge($scan->toArray(), ['usage' => $usage]), 201);
        } finally {
            if (! $consumed) {
                $allowances->release($request->user(), UsageAllowanceService::SCANS, $reservation);
            }
        }
    }
}
