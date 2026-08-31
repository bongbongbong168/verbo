<?php

use App\Http\Controllers\Api\ArticleController;
use App\Http\Controllers\Api\LearningPreferenceController;
use App\Http\Controllers\Api\ArticleInteractionController;
use App\Http\Controllers\Api\ArticleCommentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\ClassroomItemController;
use App\Http\Controllers\Api\ClassroomController;
use App\Http\Controllers\Api\FlashcardController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\LearningController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PodcastController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ActivityController;
use App\Http\Controllers\Api\QuoteController;
use App\Http\Controllers\Api\ScanController;
use App\Http\Controllers\Api\StudyGrammarPointController;
use App\Http\Controllers\Api\StudyLevelController;
use App\Http\Controllers\Api\RecentViewController;
use App\Http\Controllers\Api\StudyQuizQuestionController;
use App\Http\Controllers\Api\StudyTextController;
use App\Http\Controllers\Api\StudyUnitController;
use App\Http\Controllers\Api\StudyVocabularyController;
use App\Http\Controllers\Api\TutorAvailabilityController;
use App\Http\Controllers\Api\TutorController;
use App\Http\Controllers\Api\TutorLessonController;
use App\Http\Controllers\Api\TutorResumeEntryController;
use App\Http\Controllers\Api\TutorReviewController;
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
    /* In the auth bucket with the others. A forged ID token cannot be
       brute-forced in any useful sense, but this is still an unauthenticated
       endpoint that creates accounts, and the cheap limit costs a real user
       nothing — nobody signs in with Google ten times a minute. */
    Route::post('/auth/google', [AuthController::class, 'google']);
});

// Public: the share token is the credential. See ScanController::shared —
// the response deliberately carries no owner information.
Route::get('/shared/scans/{token}', [ScanController::class, 'shared']);

// Public so <audio src> can reach it — see PodcastController::audio.
Route::get('/podcasts/{podcast}/audio', [PodcastController::class, 'audio']);

/* Stripe's webhook. Necessarily outside auth:sanctum — Stripe holds no token —
   so the SIGNATURE is the authentication, verified in the controller against
   STRIPE_WEBHOOK_SECRET. Also outside the `api` throttle: a burst of retries
   from Stripe must never be rate-limited into being dropped, which would lose
   the fulfilment of a real payment. */
Route::post('/stripe/webhook', [PaymentController::class, 'webhook'])
    ->withoutMiddleware('throttle:api');

// Whether payments are live, plus the publishable key. Public because the
// checkout page needs it before it knows who is looking.
Route::get('/payments/config', [PaymentController::class, 'config']);

/* Whether Google sign-in is available. Public for the same reason: the login
   page has to decide whether to render the button before anyone has signed in.
   Carries no client id — the frontend has its own copy in VITE_GOOGLE_CLIENT_ID
   and needs it at build time, long before this could answer. */
Route::get('/auth/google/config', function () {
    return response()->json(['enabled' => \App\Services\GoogleAuthService::configured()]);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'me']);

    // Settings page.
    Route::put('/user/profile', [ProfileController::class, 'update']);
    // Stamps users.onboarded_at. Called once at the end of the onboarding
    // flow — by "Start learning" AND by "Skip for now", since skipping is
    // still an answer to "have you been asked?".
    Route::post('/user/onboarded', [ProfileController::class, 'completeOnboarding']);
    Route::put('/user/password', [ProfileController::class, 'updatePassword']);
    Route::post('/user/sessions/revoke-others', [ProfileController::class, 'revokeOtherSessions']);
    Route::post('/user/avatar', [ProfileController::class, 'updateAvatar']);
    Route::delete('/user/avatar', [ProfileController::class, 'deleteAvatar']);
    Route::get('/user/stats', [ProfileController::class, 'stats']);
    // Profile page + the header popover.
    Route::get('/user/overview', [ProfileController::class, 'overview']);

    Route::get('/flashcards', [FlashcardController::class, 'index']);
    // Both must be declared BEFORE any `/flashcards/{flashcard}` route, or
    // "stats" and "review" bind as ids — the same trap `bookings/clear-past`,
    // `notifications/read-all` and `articles/recommended` hit.
    Route::get('/flashcards/stats', [FlashcardController::class, 'stats']);
    Route::get('/flashcards/review', [FlashcardController::class, 'review']);
    Route::post('/flashcards', [FlashcardController::class, 'store']);
    Route::post('/flashcards/{flashcard}/grade', [FlashcardController::class, 'grade']);
    Route::delete('/flashcards/{flashcard}', [FlashcardController::class, 'destroy']);

    Route::get('/scans', [ScanController::class, 'index']);
    Route::post('/scans', [ScanController::class, 'store']);
    Route::get('/scans/{scan}', [ScanController::class, 'show']);
    Route::delete('/scans/{scan}', [ScanController::class, 'destroy']);
    Route::post('/scans/{scan}/share', [ScanController::class, 'share']);
    Route::delete('/scans/{scan}/share', [ScanController::class, 'unshare']);

    Route::get('/articles', [ArticleController::class, 'index']);
    /* Declared BEFORE /articles/{article}, or "recommended" binds as an id —
       the same trap bookings/clear-past and notifications/read-all hit. */
    Route::get('/articles/recommended', [ArticleController::class, 'recommended']);
    Route::get('/articles/{article}', [ArticleController::class, 'show']);

    /* Reader interactions. Each toggle returns the article's fresh counts plus
       this viewer's own state, so the buttons never have to guess. */
    Route::post('/articles/{article}/like', [ArticleInteractionController::class, 'toggleLike']);
    Route::post('/articles/{article}/bookmark', [ArticleInteractionController::class, 'toggleBookmark']);
    Route::post('/articles/{article}/share', [ArticleInteractionController::class, 'share']);
    Route::post('/articles/{article}/view', [ArticleInteractionController::class, 'view']);
    Route::get('/bookmarks', [ArticleInteractionController::class, 'bookmarks']);

    // Comments, one level of replies. See ArticleCommentController.
    Route::get('/articles/{article}/comments', [ArticleCommentController::class, 'index']);
    Route::post('/articles/{article}/comments', [ArticleCommentController::class, 'store']);
    Route::put('/article-comments/{comment}', [ArticleCommentController::class, 'update']);
    Route::delete('/article-comments/{comment}', [ArticleCommentController::class, 'destroy']);

    // Learning preferences — the first input to the recommender.
    Route::get('/learning-preferences', [LearningPreferenceController::class, 'show']);
    Route::post('/learning-preferences', [LearningPreferenceController::class, 'store']);
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
    Route::post('/tutors/{tutorProfile}/reviews', [TutorReviewController::class, 'store']);
    Route::delete('/tutor-reviews/{tutorReview}', [TutorReviewController::class, 'destroy']);
    Route::post('/tutors/{tutorProfile}/resume', [TutorResumeEntryController::class, 'store']);
    Route::delete('/tutor-resume/{tutorResumeEntry}', [TutorResumeEntryController::class, 'destroy']);

    Route::get('/bookings', [BookingController::class, 'index']);
    /* Payments. `intent` creates or reuses the PaymentIntent for one purchase;
       the browser confirms it with Stripe directly, and the webhook above is
       what actually fulfils. Nothing here is ever told an amount by the
       client — see PaymentService::priceOf. */
    Route::post('/payments/intent', [PaymentController::class, 'intent']);
    Route::get('/payments', [PaymentController::class, 'index']);

    /* The dashboard's "My Learning": upcoming private lessons and group
       classes merged into one list. Read-only, owns no table. */
    Route::get('/my-learning', [LearningController::class, 'index']);

    Route::post('/bookings', [BookingController::class, 'store']);
    // The seam Stripe will plug into — confirm is what a payment webhook calls.
    Route::post('/bookings/{booking}/pay', [BookingController::class, 'pay']);
    Route::post('/bookings/{booking}/confirm', [BookingController::class, 'confirm']);
    Route::post('/bookings/{booking}/cancel', [BookingController::class, 'cancel']);
    Route::post('/bookings/{booking}/decline', [BookingController::class, 'decline']);
    Route::post('/bookings/clear-past', [BookingController::class, 'clearPast']);
    Route::delete('/bookings/{booking}', [BookingController::class, 'hide']);

    /* Messaging. Context-based: every thread exists because of a tutoring
       relationship or a course, so there is no "start a chat with anyone"
       endpoint and no user directory to search. */
    Route::get('/conversations', [ConversationController::class, 'index']);
    Route::get('/conversations/unread', [ConversationController::class, 'unreadCount']);
    Route::get('/conversations/{conversation}', [ConversationController::class, 'show']);
    Route::post('/conversations/{conversation}/messages', [ConversationController::class, 'send']);
    Route::get('/messages/{message}/attachment', [ConversationController::class, 'attachment']);
    // Opening a thread is idempotent — it returns the existing one or starts it.
    Route::post('/tutors/{tutorProfile}/conversation', [ConversationController::class, 'withTutor']);
    Route::post('/courses/{course}/conversation', [ConversationController::class, 'forCourse']);

    // Group courses: a fixed schedule sold whole, the counterpart to bookings.
    Route::get('/courses', [CourseController::class, 'index']);
    Route::get('/courses/{course}', [CourseController::class, 'show']);
    Route::get('/tutors/{tutorProfile}/courses', [CourseController::class, 'forTutor']);
    Route::post('/tutors/{tutorProfile}/courses', [CourseController::class, 'store']);
    Route::delete('/courses/{course}', [CourseController::class, 'destroy']);
    Route::post('/courses/{course}/enroll', [CourseController::class, 'enroll']);
    Route::get('/enrollments', [CourseController::class, 'myEnrollments']);
    Route::post('/enrollments/{enrollment}/confirm', [CourseController::class, 'confirmEnrollment']);
    Route::post('/enrollments/{enrollment}/cancel', [CourseController::class, 'cancelEnrollment']);
    Route::delete('/enrollments/{enrollment}', [CourseController::class, 'hideEnrollment']);

    Route::get('/tutors/{tutorProfile}/availability', [TutorAvailabilityController::class, 'index']);
    Route::post('/tutors/{tutorProfile}/availability', [TutorAvailabilityController::class, 'store']);
    Route::get('/tutors/{tutorProfile}/slots', [TutorAvailabilityController::class, 'slots']);

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

    // "Pick up where you left off": the unit and episode pages ping store() on
    // load and the Dashboard reads index(). One recency list across modules —
    // see RecentViewController for the whitelist of what may be recorded.
    Route::post('/recent-views', [RecentViewController::class, 'store']);
    Route::get('/recent-views', [RecentViewController::class, 'index']);

    Route::get('/activity', [ActivityController::class, 'index']);
    // Time tracking behind the Dashboard's activity chart. The heartbeat
    // credits the gap between beats server-side; see ActivityController.
    Route::post('/activity/heartbeat', [ActivityController::class, 'heartbeat']);
    Route::get('/activity/summary', [ActivityController::class, 'summary']);

    /* In-app notifications. Raised inline by the controllers that handle the
       events — there is no queue or scheduler here, so nothing time-based. */
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread', [NotificationController::class, 'unreadCount']);
    // Declared BEFORE the {notification} routes, or "read-all" binds as an id.
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    /* Declared BEFORE the {notification} route below. Different path shapes so
       there is no real collision here, but keeping the specific route first is
       the habit that stops the next one binding as an id — the trap
       bookings/clear-past and notifications/read-all both hit. */
    Route::delete('/notifications', [NotificationController::class, 'destroyAll']);
    Route::delete('/notifications/{notification}', [NotificationController::class, 'destroy']);

    /* ---- Tutor portal: classrooms, curriculum, submissions ----
       A classroom is deliberately NOT a course: a course is a sellable product
       with a price and a checkout, a classroom is a teaching container with a
       roster, a join code and a curriculum feed. */
    Route::get('/classes', [ClassroomController::class, 'index']);
    Route::post('/classes', [ClassroomController::class, 'store']);
    // Declared BEFORE /classes/{class} or "join" binds as an id — the same
    // trap bookings/clear-past and notifications/read-all hit.
    Route::post('/classes/join', [ClassroomController::class, 'join']);
    Route::get('/classes/{class}', [ClassroomController::class, 'show']);
    Route::put('/classes/{class}', [ClassroomController::class, 'update']);
    Route::delete('/classes/{class}', [ClassroomController::class, 'destroy']);
    Route::get('/classes/{class}/students', [ClassroomController::class, 'students']);
    Route::delete('/classes/{class}/members/{userId}', [ClassroomController::class, 'removeMember']);

    Route::post('/classes/{class}/items', [ClassroomItemController::class, 'store']);
    Route::put('/class-items/{item}', [ClassroomItemController::class, 'update']);
    Route::delete('/class-items/{item}', [ClassroomItemController::class, 'destroy']);
    Route::get('/class-items/{item}/submissions', [ClassroomItemController::class, 'submissions']);
    Route::post('/class-items/{item}/submit', [ClassroomItemController::class, 'submit']);
    Route::post('/submissions/{submission}/grade', [ClassroomItemController::class, 'grade']);

    // Streamed through an authorised route — student work never gets a public
    // URL that anyone holding it could read.
    Route::get('/class-files/{file}', [ClassroomItemController::class, 'downloadItemFile']);
    Route::get('/submission-files/{file}', [ClassroomItemController::class, 'downloadSubmissionFile']);

    Route::get('/quote', [QuoteController::class, 'show']);
    Route::post('/quote', [QuoteController::class, 'store']);
});
