<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\Submission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClassroomController extends Controller
{
    /**
     * Everything this user has a stake in, split by the role they hold in it.
     *
     * One call rather than two, because the dashboard shows both and a person
     * can easily be a teacher of one class and a student in another.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $teaching = $user->classroomsTeaching()
            ->whereNull('archived_at')
            ->withCount(['members as students_count', 'assignments as assignments_count'])
            ->latest('id')
            ->get()
            ->map(fn (Classroom $c) => $this->card($c, 'teacher'));

        $joined = $user->classroomsJoined()
            ->whereNull('archived_at')
            ->withCount(['members as students_count', 'assignments as assignments_count'])
            ->get()
            ->map(fn (Classroom $c) => $this->card($c, 'student'));

        return response()->json([
            'teaching' => $teaching->values(),
            'joined' => $joined->values(),
            // Drives the dashboard's "N submissions waiting" line.
            'to_grade' => $this->pendingGradeCount($user),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'subject' => ['nullable', 'string', 'max:60'],
            'level' => ['nullable', 'string', 'max:40'],
            'focus' => ['nullable', 'string', 'max:60'],
            'term' => ['nullable', 'string', 'max:40'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);

        $class = new Classroom($data);
        $class->user_id = $request->user()->id;
        // Not mass-assignable: the code is the credential that gets someone
        // into the class, so a request body must never be able to set it.
        $class->join_code = Classroom::makeJoinCode($data['name']);
        $class->save();

        return response()->json($this->card($class->fresh(), 'teacher'), 201);
    }

    /** The class page: roster and curriculum, shaped for whoever is asking. */
    public function show(Request $request, Classroom $class)
    {
        $user = $request->user();
        $role = $this->roleFor($class, $user->id);
        abort_if($role === null, 403);

        $class->load(['items.files', 'teacher:id,name,avatar_path']);

        $items = $class->items->map(function ($item) use ($class, $user, $role) {
            $row = [
                'id' => $item->id,
                'type' => $item->type,
                'title' => $item->title,
                'description' => $item->description,
                'due_at' => $item->due_at,
                'allow_late' => $item->allow_late,
                'points' => $item->points,
                'is_overdue' => $item->is_overdue,
                'created_at' => $item->created_at,
                'files' => $item->files->map(fn ($f) => [
                    'id' => $f->id, 'name' => $f->name, 'size' => $f->size, 'mime' => $f->mime,
                ]),
            ];

            if ($item->type !== 'assignment') {
                return $row;
            }

            if ($role === 'teacher') {
                // "3/18 turned in" — the number the teacher actually scans for.
                $row['turned_in'] = Submission::where('classroom_item_id', $item->id)
                    ->whereNotNull('submitted_at')->count();
                $row['total_students'] = $class->members()->count();
                $row['graded'] = Submission::where('classroom_item_id', $item->id)
                    ->whereNotNull('graded_at')->count();
            } else {
                $mine = Submission::where('classroom_item_id', $item->id)
                    ->where('user_id', $user->id)->with('files')->first();
                $row['my_submission'] = $mine ? $this->submissionRow($mine) : null;
            }

            return $row;
        });

        return response()->json([
            'id' => $class->id,
            'name' => $class->name,
            'subject' => $class->subject,
            'level' => $class->level,
            'focus' => $class->focus,
            'term' => $class->term,
            'description' => $class->description,
            'role' => $role,
            // Only the teacher gets the code — it is how people get in.
            'join_code' => $role === 'teacher' ? $class->join_code : null,
            'join_open' => $class->join_open,
            'teacher' => [
                'id' => $class->teacher?->id,
                'name' => $class->teacher?->name,
                'avatar_url' => $class->teacher?->avatar_url,
            ],
            'students_count' => $class->members()->count(),
            'items' => $items,
        ]);
    }

    public function update(Request $request, Classroom $class)
    {
        abort_unless($this->isTeacher($class, $request->user()->id), 403);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'subject' => ['nullable', 'string', 'max:60'],
            'level' => ['nullable', 'string', 'max:40'],
            'focus' => ['nullable', 'string', 'max:60'],
            'term' => ['nullable', 'string', 'max:40'],
            'description' => ['nullable', 'string', 'max:2000'],
            'join_open' => ['sometimes', 'boolean'],
        ]);

        $class->update($data);

        return response()->json($this->card($class->fresh(), 'teacher'));
    }

    public function destroy(Request $request, Classroom $class)
    {
        abort_unless($this->isTeacher($class, $request->user()->id), 403);
        $class->delete();

        return response()->noContent();
    }

    /** The roster, with each student's progress across the class's work. */
    public function students(Request $request, Classroom $class)
    {
        abort_unless($this->isTeacher($class, $request->user()->id), 403);

        $assignmentIds = $class->assignments()->pluck('id');
        $total = $assignmentIds->count();

        $rows = $class->members()->with('user:id,name,email,avatar_path')->get()
            ->map(function (ClassroomMember $m) use ($assignmentIds, $total) {
                $done = $assignmentIds->isEmpty() ? 0 : Submission::whereIn('classroom_item_id', $assignmentIds)
                    ->where('user_id', $m->user_id)
                    ->whereNotNull('submitted_at')
                    ->count();

                return [
                    'id' => $m->user_id,
                    'name' => $m->user?->name,
                    'email' => $m->user?->email,
                    'avatar_url' => $m->user?->avatar_url,
                    'joined_at' => $m->joined_at,
                    'submitted' => $done,
                    'total' => $total,
                    // "2/3" is the honest figure; a percentage of nothing is 0%
                    // and reads as failure rather than as "no work set yet".
                    'percent' => $total ? (int) round($done / $total * 100) : null,
                ];
            });

        return response()->json($rows->values());
    }

    /** Join by code. Idempotent — entering the same code twice is a no-op. */
    public function join(Request $request)
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:12'],
        ]);

        $class = Classroom::whereRaw('UPPER(join_code) = ?', [strtoupper(trim($data['code']))])
            ->whereNull('archived_at')
            ->first();

        if (! $class) {
            return response()->json(['message' => 'No class matches that code.'], 404);
        }

        if (! $class->join_open) {
            return response()->json(['message' => 'That class is not accepting new students.'], 422);
        }

        if ($this->isTeacher($class, $request->user()->id)) {
            return response()->json(['message' => 'You teach that class.'], 422);
        }

        // firstOrCreate + the unique index: joining twice cannot duplicate.
        $class->members()->firstOrCreate(
            ['user_id' => $request->user()->id],
            ['joined_at' => now()]
        );

        return response()->json($this->card($class->fresh(), 'student'));
    }

    /** A student leaving, or a teacher removing someone. */
    public function removeMember(Request $request, Classroom $class, int $userId)
    {
        $isTeacher = $this->isTeacher($class, $request->user()->id);
        abort_unless($isTeacher || $request->user()->id === $userId, 403);

        $class->members()->where('user_id', $userId)->delete();

        return response()->noContent();
    }

    /* ---------------- helpers ---------------- */

    public static function roleFor(Classroom $class, int $userId): ?string
    {
        // Cast: SQLite hands foreign keys back as strings.
        if ((int) $class->user_id === $userId) {
            return 'teacher';
        }

        return $class->members()->where('user_id', $userId)->exists() ? 'student' : null;
    }

    public static function isTeacher(Classroom $class, int $userId): bool
    {
        return (int) $class->user_id === $userId;
    }

    private function card(Classroom $c, string $role): array
    {
        return [
            'id' => $c->id,
            'name' => $c->name,
            'subject' => $c->subject,
            'level' => $c->level,
            'focus' => $c->focus,
            'term' => $c->term,
            'description' => $c->description,
            'role' => $role,
            'join_code' => $role === 'teacher' ? $c->join_code : null,
            'join_open' => $c->join_open,
            'students_count' => $c->students_count ?? $c->members()->count(),
            'assignments_count' => $c->assignments_count ?? $c->assignments()->count(),
        ];
    }

    private function submissionRow(Submission $s): array
    {
        return [
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
        ];
    }

    /** Submissions across every class this user teaches that need a grade. */
    private function pendingGradeCount($user): int
    {
        return Submission::whereNotNull('submitted_at')
            ->whereNull('graded_at')
            ->whereIn('classroom_item_id', function ($q) use ($user) {
                $q->select('classroom_items.id')
                    ->from('classroom_items')
                    ->join('classrooms', 'classrooms.id', '=', 'classroom_items.classroom_id')
                    ->where('classrooms.user_id', $user->id);
            })
            ->count();
    }
}
