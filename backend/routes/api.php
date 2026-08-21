<?php

use App\Http\Controllers\Api\ArticleController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\FlashcardController;
use App\Http\Controllers\Api\PodcastController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ActivityController;
use App\Http\Controllers\Api\QuoteController;
use App\Http\Controllers\Api\ScanController;
use App\Http\Controllers\Api\StudyGrammarPointController;
use App\Http\Controllers\Api\StudyLevelController;
use App\Http\Controllers\Api\StudyProgressController;
use App\Http\Controllers\Api\StudyQuizQuestionController;
use App\Http\Controllers\Api\StudyTextController;
use App\Http\Controllers\Api\StudyUnitController;
use App\Http\Controllers\Api\StudyVocabularyController;
use App\Http\Controllers\Api\TutorController;
use App\Http\Controllers\Api\TutorLessonController;
use App\Http\Controllers\Api\TutorResumeEntryController;
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

// Public: the share token is the credential. See ScanController::shared —
// the response deliberately carries no owner information.
Route::get('/shared/scans/{token}', [ScanController::class, 'shared']);

// Public so <audio src> can reach it — see PodcastController::audio.
Route::get('/podcasts/{podcast}/audio', [PodcastController::class, 'audio']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'me']);

    // Settings page.
    Route::put('/user/profile', [ProfileController::class, 'update']);
    Route::put('/user/password', [ProfileController::class, 'updatePassword']);
    Route::post('/user/sessions/revoke-others', [ProfileController::class, 'revokeOtherSessions']);
    Route::get('/user/stats', [ProfileController::class, 'stats']);

    Route::get('/flashcards', [FlashcardController::class, 'index']);
    Route::post('/flashcards', [FlashcardController::class, 'store']);
    Route::delete('/flashcards/{flashcard}', [FlashcardController::class, 'destroy']);

    Route::get('/scans', [ScanController::class, 'index']);
    Route::post('/scans', [ScanController::class, 'store']);
    Route::get('/scans/{scan}', [ScanController::class, 'show']);
    Route::delete('/scans/{scan}', [ScanController::class, 'destroy']);
    Route::post('/scans/{scan}/share', [ScanController::class, 'share']);
    Route::delete('/scans/{scan}/share', [ScanController::class, 'unshare']);

    Route::get('/articles', [ArticleController::class, 'index']);
    Route::get('/articles/{article}', [ArticleController::class, 'show']);
    Route::post('/articles', [ArticleController::class, 'store']);
    Route::put('/articles/{article}', [ArticleController::class, 'update']);
    Route::delete('/articles/{article}', [ArticleController::class, 'destroy']);

    Route::get('/tutors', [TutorController::class, 'index']);
    Route::get('/tutor-profile', [TutorController::class, 'show']);
    Route::post('/tutor-profile', [TutorController::class, 'store']);
    Route::get('/tutors/{tutorProfile}', [TutorController::class, 'showProfile']);
    Route::post('/tutors/{tutorProfile}/photo', [TutorController::class, 'updatePhoto']);
    // Profile-scoped rather than hung off /tutor-profile, so an admin can edit
    // a seeded tutor through the same drawer the tutor uses on themselves.
    Route::post('/tutors/{tutorProfile}/profile', [TutorController::class, 'updateProfile']);
    Route::post('/tutors/{tutorProfile}/lessons', [TutorLessonController::class, 'store']);
    Route::delete('/tutor-lessons/{lesson}', [TutorLessonController::class, 'destroy']);
    Route::post('/tutors/{tutorProfile}/resume', [TutorResumeEntryController::class, 'store']);
    Route::delete('/tutor-resume/{tutorResumeEntry}', [TutorResumeEntryController::class, 'destroy']);

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
    Route::post('/study-units/{studyUnit}/culture-images', [StudyUnitController::class, 'storeCultureImage']);
    Route::delete('/study-culture-images/{studyCultureImage}', [StudyUnitController::class, 'destroyCultureImage']);

    Route::post('/study-units/{studyUnit}/vocabulary', [StudyVocabularyController::class, 'store']);
    Route::delete('/study-vocabulary/{studyVocabulary}', [StudyVocabularyController::class, 'destroy']);

    Route::post('/study-units/{studyUnit}/texts', [StudyTextController::class, 'store']);
    Route::delete('/study-texts/{studyText}', [StudyTextController::class, 'destroy']);
    Route::post('/study-texts/{studyText}/lines', [StudyTextController::class, 'storeLine']);
    Route::delete('/study-text-lines/{studyTextLine}', [StudyTextController::class, 'destroyLine']);

    Route::post('/study-units/{studyUnit}/grammar', [StudyGrammarPointController::class, 'store']);
    Route::put('/study-grammar/{studyGrammarPoint}', [StudyGrammarPointController::class, 'update']);
    Route::delete('/study-grammar/{studyGrammarPoint}', [StudyGrammarPointController::class, 'destroy']);
    Route::post('/study-grammar/{studyGrammarPoint}/examples', [StudyGrammarPointController::class, 'storeExample']);
    Route::delete('/study-grammar-examples/{studyGrammarExample}', [StudyGrammarPointController::class, 'destroyExample']);

    Route::post('/study-units/{studyUnit}/quiz', [StudyQuizQuestionController::class, 'store']);
    Route::delete('/study-quiz/{studyQuizQuestion}', [StudyQuizQuestionController::class, 'destroy']);
    Route::post('/study-quiz/{studyQuizQuestion}/check', [StudyQuizQuestionController::class, 'check']);

    // "Pick up where you left off": the unit page pings store() on load and the
    // Dashboard reads latest().
    Route::post('/study-units/{studyUnit}/view', [StudyProgressController::class, 'store']);
    Route::get('/study-progress/latest', [StudyProgressController::class, 'latest']);

    Route::get('/activity', [ActivityController::class, 'index']);
    // Time tracking behind the Dashboard's activity chart. The heartbeat
    // credits the gap between beats server-side; see ActivityController.
    Route::post('/activity/heartbeat', [ActivityController::class, 'heartbeat']);
    Route::get('/activity/summary', [ActivityController::class, 'summary']);

    Route::get('/quote', [QuoteController::class, 'show']);
    Route::post('/quote', [QuoteController::class, 'store']);
});
