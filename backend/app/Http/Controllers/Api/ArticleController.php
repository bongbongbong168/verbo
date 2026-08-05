<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Services\DictionaryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ArticleController extends Controller
{
    public function index()
    {
        // The excerpt is trimmed in the database so full article bodies never
        // cross the wire just to render a two-line card preview. SUBSTR counts
        // characters (not bytes) on both SQLite and Postgres, so Chinese text
        // is cut safely.
        return Article::query()
            ->latest()
            ->get([
                'id',
                'title',
                'type',
                'image_path',
                'user_id',
                'created_at',
                DB::raw('SUBSTR(body, 1, 120) AS excerpt'),
            ]);
    }

    public function show(Article $article, DictionaryService $dictionary)
    {
        return array_merge($article->toArray(), [
            'tokens' => $dictionary->annotate($article->body),
        ]);
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:article,story,funfact'],
            'body' => ['required', 'string'],
            'body_en' => ['nullable', 'string'],
            'image' => ['nullable', 'image', 'max:10240'],
        ]);

        if ($request->hasFile('image')) {
            $data['image_path'] = $request->file('image')->store('articles', 'public');
        }

        $article = $request->user()->articles()->create($data);

        return response()->json($article, 201);
    }

    public function update(Request $request, Article $article)
    {
        abort_unless($request->user()->is_admin, 403);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:article,story,funfact'],
            'body' => ['required', 'string'],
            'body_en' => ['nullable', 'string'],
            'image' => ['nullable', 'image', 'max:10240'],
        ]);

        if ($request->hasFile('image')) {
            if ($article->image_path) {
                Storage::disk('public')->delete($article->image_path);
            }
            $data['image_path'] = $request->file('image')->store('articles', 'public');
        }

        $article->update($data);

        return response()->json($article);
    }

    public function destroy(Request $request, Article $article)
    {
        abort_unless($request->user()->is_admin, 403);

        if ($article->image_path) {
            Storage::disk('public')->delete($article->image_path);
        }

        $article->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
