<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classroom;
use App\Models\ClassroomItem;
use App\Models\ClassroomItemFile;
use App\Models\Notification;
use App\Models\Submission;
use App\Models\SubmissionFile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ClassroomItemController extends Controller
{
    /** Files live on the PRIVATE disk — student work is not public. */
    private const DISK = 'local';

    private const FILE_RULES = [
        'nullable', 'file', 'max:20480',
        'mimes:pdf,doc,docx,txt,rtf,odt,jpg,jpeg,png,webp,gif,mp3,wav,m4a,ogg,mp4,zip,ppt,pptx,xls,xlsx',
    ];

    /** Post an assignment or a material to the curriculum feed. */
    public function store(Request $request, Classroom $class)
    {
        abort_unless(ClassroomController::isTeacher($class, $request->user()->id), 403);

        $data = $request->validate([
            'type' => ['required', Rule::in(ClassroomItem::TYPES)],
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:5000'],
            'due_at' => ['nullable', 'date'],
            'allow_late' => ['nullable', 'boolean'],
            'points' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'files' => ['nullable', 'array', 'max:10'],
            'files.*' => self::FILE_RULES,
        ]);

        // A material has no deadline and no score; accepting them would put
        // columns on the row that the UI would then have to hide.
        if ($data['type'] === 'material') {
            $data['due_at'] = null;
            $data['points'] = null;
        }

        $item = $class->items()->create([
            'type' => $data['type'],
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'due_at' => $data['due_at'] ?? null,
            'allow_late' => $data['allow_late'] ?? true,
            'points' => $data['points'] ?? null,
        ]);

        $this->storeFiles($request, 'files', fn (array $f) => $item->files()->create($f));

        // Tell the roster there is something new. push() drops the actor, so
        // the teacher is never told about their own post.
        $label = $data['type'] === 'assignment' ? 'New assignment' : 'New material';
        foreach ($class->members()->pluck('user_id') as $studentId) {
            Notification::raise($studentId, $request->user()->id, 'message', [
                'title' => $label.' in '.$class->name,
                'body' => $item->title,
                'link' => '/classes/'.$class->id,
            ]);
        }

        return response()->json($item->load('files'), 201);
    }

    public function update(Request $request, ClassroomItem $item)
    {
        abort_unless(
            ClassroomController::isTeacher($item->classroom, $request->user()->id),
            403
        );

        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:5000'],
            'due_at' => ['nullable', 'date'],
            'allow_late' => ['sometimes', 'boolean'],
            'points' => ['nullable', 'integer', 'min:0', 'max:1000'],
        ]);

        $item->update($data);

        return response()->json($item->fresh()->load('files'));
    }

    public function destroy(Request $request, ClassroomItem $item)
    {
        abort_unless(
            ClassroomController::isTeacher($item->classroom, $request->user()->id),
            403
        );

        // The rows cascade, but the files on disk do not — delete them here or
        // they are orphaned forever.
        foreach ($item->files as $f) {
            Storage::disk(self::DISK)->delete($f->path);
        }
        foreach ($item->submissions()->with('files')->get() as $sub) {
            foreach ($sub->files as $f) {
                Storage::disk(self::DISK)->delete($f->path);
            }
        }

        $item->delete();

        return response()->noContent();
    }

    /**
     * Every student's row for one assignment — the table the teacher grades
     * from. Students who have NOT submitted are included, because "who is
     * missing" is the question this screen exists to answer.
     */
    public function submissions(Request $request, ClassroomItem $item)
    {
        $class = $item->classroom;
        abort_unless(ClassroomController::isTeacher($class, $request->user()->id), 403);

        $subs = $item->submissions()->with(['user:id,name,email,avatar_path', 'files'])->get()
            ->keyBy('user_id');

        $rows = $class->members()->with('user:id,name,email,avatar_path')->get()
            ->map(function ($m) use ($subs) {
                $s = $subs->get($m->user_id);

                return [
                    'user' => [
                        'id' => $m->user?->id,
                        'name' => $m->user?->name,
                        'email' => $m->user?->email,
                        'avatar_url' => $m->user?->avatar_url,
                    ],
                    'submission' => $s ? [
                        'id' => $s->id,
                        'status' => $s->status,
                        'submitted_at' => $s->submitted_at,
                        'is_late' => $s->is_late,
                        'score' => $s->score,
                        'feedback' => $s->feedback,
                        'note' => $s->note,
                        'files' => $s->files->map(fn ($f) => [
                            'id' => $f->id, 'name' => $f->name, 'size' => $f->size, 'mime' => $f->mime,
                        ]),
                    ] : null,
                ];
            });

        return response()->json([
            'item' => [
                'id' => $item->id,
                'title' => $item->title,
                'due_at' => $item->due_at,
                'points' => $item->points,
                'allow_late' => $item->allow_late,
            ],
            'rows' => $rows->values(),
        ]);
    }

    /**
     * A student turns work in.
     *
     * Resubmitting REPLACES the previous files rather than adding a second row
     * — there is one piece of work per student per assignment, and two rows
     * would leave the teacher wondering which to grade.
     */
    public function submit(Request $request, ClassroomItem $item)
    {
        $user = $request->user();
        $class = $item->classroom;

        abort_if(ClassroomController::roleFor($class, $user->id) !== 'student', 403);
        abort_unless($item->type === 'assignment', 422);

        $late = $item->due_at && now()->gt($item->due_at);
        if ($late && ! $item->allow_late) {
            return response()->json([
                'message' => 'This assignment is closed — the due date has passed.',
            ], 422);
        }

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:2000'],
            'files' => ['nullable', 'array', 'max:10'],
            'files.*' => self::FILE_RULES,
        ]);

        $submission = Submission::firstOrNew([
            'classroom_item_id' => $item->id,
            'user_id' => $user->id,
        ]);

        $submission->note = $data['note'] ?? null;
        $submission->submitted_at = now();
        // Recorded now, so it stays true even if the teacher later moves the
        // deadline.
        $submission->is_late = $late;
        $submission->save();

        if ($request->hasFile('files')) {
            foreach ($submission->files as $old) {
                Storage::disk(self::DISK)->delete($old->path);
                $old->delete();
            }
            $this->storeFiles($request, 'files', fn (array $f) => $submission->files()->create($f));
        }

        Notification::raise($class->user_id, $user->id, 'message', [
            'title' => 'Work submitted',
            'body' => $user->name.' turned in '.$item->title.'.',
            'link' => '/classes/'.$class->id.'/assignments/'.$item->id,
        ]);

        return response()->json($submission->fresh()->load('files'), 201);
    }

    /** The teacher scores it and writes feedback. */
    public function grade(Request $request, Submission $submission)
    {
        $item = $submission->item;
        $class = $item->classroom;
        abort_unless(ClassroomController::isTeacher($class, $request->user()->id), 403);

        $data = $request->validate([
            'score' => ['nullable', 'integer', 'min:0', 'max:'.($item->points ?: 1000)],
            'feedback' => ['nullable', 'string', 'max:5000'],
        ]);

        $submission->update([
            'score' => $data['score'] ?? null,
            'feedback' => $data['feedback'] ?? null,
            'graded_at' => now(),
            'graded_by' => $request->user()->id,
        ]);

        Notification::raise($submission->user_id, $request->user()->id, 'message', [
            'title' => 'Work graded',
            'body' => $item->title.($data['score'] !== null && $item->points
                ? ' — '.$data['score'].'/'.$item->points
                : ''),
            'link' => '/classes/'.$class->id,
        ]);

        return response()->json($submission->fresh()->load('files'));
    }

    /**
     * Stream a file.
     *
     * Never a public URL: the teacher, the student who submitted it, and
     * nobody else. A guessable path would leak one student's work to the whole
     * internet.
     */
    public function downloadItemFile(Request $request, ClassroomItemFile $file)
    {
        $class = $file->classroomItem->classroom;
        abort_if(ClassroomController::roleFor($class, $request->user()->id) === null, 403);

        return $this->stream($file);
    }

    public function downloadSubmissionFile(Request $request, SubmissionFile $file)
    {
        $submission = $file->submission;
        $class = $submission->item->classroom;
        $user = $request->user();

        $allowed = ClassroomController::isTeacher($class, $user->id)
            || (int) $submission->user_id === $user->id;
        abort_unless($allowed, 403);

        return $this->stream($file);
    }

    /* ---------------- helpers ---------------- */

    private function stream($file)
    {
        abort_unless(Storage::disk(self::DISK)->exists($file->path), 404);

        return Storage::disk(self::DISK)->download($file->path, $file->name);
    }

    private function storeFiles(Request $request, string $key, callable $save): void
    {
        foreach ((array) $request->file($key, []) as $upload) {
            $save([
                'path' => $upload->store('classwork', self::DISK),
                'name' => $upload->getClientOriginalName(),
                'mime' => $upload->getClientMimeType(),
                'size' => $upload->getSize(),
            ]);
        }
    }
}
