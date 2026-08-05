<?php

use App\Http\Controllers\Api\ArticleController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\FlashcardController;
use App\Http\Controllers\Api\PodcastController;
use App\Http\Controllers\Api\QuoteController;
use App\Http\Controllers\Api\ScanController;
use App\Http\Controllers\Api\StudyGrammarPointController;
use App\Http\Controllers\Api\StudyLevelController;
use App\Http\Controllers\Api\StudyQuizQuestionController;
use App\Http\Controllers\Api\StudyUnitController;
use App\Http\Controllers\Api\StudyVocabularyController;
use App\Http\Controllers\Api\TutorController;
use App\Http\Controllers\Api\TutorLessonController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::middleware('throttle:auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

// Public so <audio src> can reach it — see PodcastController::audio.
Route::get('/podcasts/{podcast}/audio', [PodcastController::class, 'audio']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'me']);

    Route::get('/flashcards', [FlashcardController::class, 'index']);
    Route::post('/flashcards', [FlashcardController::class, 'store']);
    Route::delete('/flashcards/{flashcard}', [FlashcardController::class, 'destroy']);

    Route::get('/scans', [ScanController::class, 'index']);
    Route::post('/scans', [ScanController::class, 'store']);
    Route::get('/scans/{scan}', [ScanController::class, 'show']);

    Route::get('/articles', [ArticleController::class, 'index']);
    Route::get('/articles/{article}', [ArticleController::class, 'show']);
    Route::post('/articles', [ArticleController::class, 'store']);
    Route::put('/articles/{article}', [ArticleController::class, 'update']);
    Route::delete('/articles/{article}', [ArticleController::class, 'destroy']);

    Route::get('/tutors', [TutorController::class, 'index']);
    Route::get('/tutor-profile', [TutorController::class, 'show']);
    Route::post('/tutor-profile', [TutorController::class, 'store']);
    Route::get('/tutors/{tutorProfile}', [TutorController::class, 'showProfile']);
    Route::post('/tutor-profile/lessons', [TutorLessonController::class, 'store']);
    Route::delete('/tutor-profile/lessons/{lesson}', [TutorLessonController::class, 'destroy']);

    Route::get('/bookings', [BookingController::class, 'index']);
    Route::post('/bookings', [BookingController::class, 'store']);

    Route::get('/podcasts', [PodcastController::class, 'index']);
    Route::get('/podcasts/{podcast}', [PodcastController::class, 'show']);
    Route::post('/podcasts', [PodcastController::class, 'store']);
    Route::put('/podcasts/{podcast}', [PodcastController::class, 'update']);
    Route::delete('/podcasts/{podcast}', [PodcastController::class, 'destroy']);

    Route::get('/study-levels', [StudyLevelController::class, 'index']);
    Route::get('/study-levels/{studyLevel}', [StudyLevelController::class, 'show']);
    Route::post('/study-levels', [StudyLevelController::class, 'store']);
    Route::put('/study-levels/{studyLevel}', [StudyLevelController::class, 'update']);
    Route::delete('/study-levels/{studyLevel}', [StudyLevelController::class, 'destroy']);

    Route::post('/study-levels/{studyLevel}/units', [StudyUnitController::class, 'store']);
    Route::get('/study-units/{studyUnit}', [StudyUnitController::class, 'show']);
    Route::put('/study-units/{studyUnit}', [StudyUnitController::class, 'update']);
    Route::delete('/study-units/{studyUnit}', [StudyUnitController::class, 'destroy']);

    Route::post('/study-units/{studyUnit}/vocabulary', [StudyVocabularyController::class, 'store']);
    Route::delete('/study-vocabulary/{studyVocabulary}', [StudyVocabularyController::class, 'destroy']);

    Route::post('/study-units/{studyUnit}/grammar', [StudyGrammarPointController::class, 'store']);
    Route::delete('/study-grammar/{studyGrammarPoint}', [StudyGrammarPointController::class, 'destroy']);

    Route::post('/study-units/{studyUnit}/quiz', [StudyQuizQuestionController::class, 'store']);
    Route::delete('/study-quiz/{studyQuizQuestion}', [StudyQuizQuestionController::class, 'destroy']);
    Route::post('/study-quiz/{studyQuizQuestion}/check', [StudyQuizQuestionController::class, 'check']);

    Route::get('/quote', [QuoteController::class, 'show']);
    Route::post('/quote', [QuoteController::class, 'store']);
});
