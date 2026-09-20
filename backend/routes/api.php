<?php

use App\Http\Controllers\Api\ArticleController;
use App\Http\Controllers\Api\LearningPlanController;
use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\PaymentMethodController;
use App\Http\Controllers\Api\PracticeChatController;
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
use App\Http\Controllers\Api\PodcastTranscriptController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ActivityController;
use App\Http\Controllers\Api\QuoteController;
use App\Http\Controllers\Api\ScanController;
use App\Http\Controllers\Api\StudyGrammarPointController;
use App\Http\Controllers\Api\StudyLevelController;
use App\Http\Controllers\Api\RecentViewController;
use App\Http\Controllers\Api\StudyQuizQuestionController;
use App\Http\Controllers\Api\StudyTextController;
use App\Http\Controllers\Api\StudyUnitCompletionController;
use App\Http\Controllers\Api\StudyUnitController;
use App\Http\Controllers\Api\StudyVocabularyController;
use App\Http\Controllers\Api\TutorAvailabilityController;
use App\Http\Controllers\Api\TutorApplicationController;
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

    /* Forgotten passwords. In the auth bucket because both are
       unauthenticated and both are guessable surfaces: the first would
       otherwise be a way to mail-bomb an address, and the second is a token
       somebody could try to brute-force. */
    Route::post('/forgot-password', [PasswordResetController::class, 'sendCode']);
    Route::post('/reset-password', [PasswordResetController::class, 'reset']);
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

    /* Saved cards. `default` is a WORD, so it is declared before the
       `{paymentMethod}` route or it binds as an id — the trap
       `bookings/clear-past` and `notifications/read-all` both hit. */
    Route::get('/payment-methods', [PaymentMethodController::class, 'index']);
    Route::post('/payment-methods', [PaymentMethodController::class, 'store']);
    Route::post('/payment-methods/{paymentMethod}/default', [PaymentMethodController::class, 'setDefault']);
    Route::delete('/payment-methods/{paymentMethod}', [PaymentMethodController::class, 'destroy']);
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
    Route::get('/flashcards/{flashcard}/examples', [FlashcardController::class, 'examples']);
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
    // Same rule: before /articles/{article}, or it binds as an id.
    Route::get('/articles/highlights', [ArticleController::class, 'highlights']);
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

    /* Tutor verification. The admin queue is declared BEFORE
       `/tutors/{tutorProfile}` further down, or "applications" would bind as a
       profile id — the trap `bookings/clear-past`, `notifications/read-all`,
       `articles/recommended`, `articles/highlights`, `podcasts/continue` and
       `classes/join` have all hit. */
    Route::get('/tutor-applications', [TutorApplicationController::class, 'index']);
    Route::get('/tutor-applications/counts', [TutorApplicationController::class, 'counts']);
    Route::get('/tutor-applications/{tutorProfile}', [TutorApplicationController::class, 'show']);
    Route::post('/tutor-applications/{tutorProfile}/decide', [TutorApplicationController::class, 'decide']);
    // The applicant's own evidence.
    Route::post('/tutor-credentials', [TutorApplicationController::class, 'storeCredential']);
    Route::get('/tutor-credentials/{tutorCredential}', [TutorApplicationController::class, 'showCredential']);
    Route::delete('/tutor-credentials/{tutorCredential}', [TutorApplicationController::class, 'destroyCredential']);
    Route::get('/tutors/{tutorProfile}', [TutorController::class, 'showProfile']);
    Route::post('/tutors/{tutorProfile}/photo', [TutorController::class, 'updatePhoto']);
    // Profile-scoped rather than hung off /tutor-profile, so an admin can edit
    // a seeded tutor through the same drawer the tutor uses on themselves.
    Route::post('/tutors/{tutorProfile}/profile', [TutorController::class, 'updateProfile']);
    Route::put('/tutors/{tutorProfile}/specialties', [TutorController::class, 'updateSpecialties']);
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
    Route::delete('/messages/{message}', [ConversationController::class, 'destroyMessage']);
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
    /* BEFORE `/podcasts/{podcast}`, or "continue" binds as an id — the same
       trap `bookings/clear-past`, `notifications/read-all`, `classes/join` and
       `articles/recommended` each hit. */
    Route::get('/podcasts/continue', [PodcastController::class, 'continueListening']);
    Route::get('/podcasts/{podcast}', [PodcastController::class, 'show']);
    Route::put('/podcasts/{podcast}/progress', [PodcastController::class, 'saveProgress']);
    // The synced, word-timed transcript. Reading is for every listener;
    // importing and clearing check is_admin inside the controller.
    Route::get('/podcasts/{podcast}/timed-transcript', [PodcastTranscriptController::class, 'show']);
    Route::post('/podcasts/{podcast}/timed-transcript', [PodcastTranscriptController::class, 'store']);
    Route::patch('/podcasts/{podcast}/timed-transcript', [PodcastTranscriptController::class, 'update']);
    Route::delete('/podcasts/{podcast}/timed-transcript', [PodcastTranscriptController::class, 'destroy']);
    Route::post('/podcasts', [PodcastController::class, 'store']);
    Route::put('/podcasts/{podcast}', [PodcastController::class, 'update']);
    Route::delete('/podcasts/{podcast}', [PodcastController::class, 'destroy']);

    Route::get('/study-levels', [StudyLevelController::class, 'index']);
    /* BEFORE the {studyLevel} route, or "daily" binds as an id — the same trap
       `bookings/clear-past`, `notifications/read-all` and
       `articles/recommended` all hit. */
    Route::get('/study-levels/daily', [StudyLevelController::class, 'daily']);
    Route::get('/study-levels/{studyLevel}', [StudyLevelController::class, 'show']);
    Route::post('/study-levels', [StudyLevelController::class, 'store']);
    Route::put('/study-levels/{studyLevel}', [StudyLevelController::class, 'update']);
    Route::delete('/study-levels/{studyLevel}', [StudyLevelController::class, 'destroy']);

    Route::post('/study-levels/{studyLevel}/units', [StudyUnitController::class, 'store']);
    Route::get('/study-units/{studyUnit}', [StudyUnitController::class, 'show']);
    // The viewer's own "finished this lesson" mark.
    Route::post('/study-units/{studyUnit}/complete', [StudyUnitCompletionController::class, 'store']);
    Route::delete('/study-units/{studyUnit}/complete', [StudyUnitCompletionController::class, 'destroy']);
    Route::put('/study-units/{studyUnit}', [StudyUnitController::class, 'update']);
    Route::delete('/study-units/{studyUnit}', [StudyUnitController::class, 'destroy']);
    Route::post('/study-units/{studyUnit}/culture-images', [StudyUnitController::class, 'storeCultureImage']);
    Route::delete('/study-culture-images/{studyCultureImage}', [StudyUnitController::class, 'destroyCultureImage']);

    Route::post('/study-units/{studyUnit}/vocabulary', [StudyVocabularyController::class, 'store']);
    /* Everything the word's explanation panel shows. Its own request rather
       than part of the unit payload: finding examples means LIKE scans across
       four tables, and doing that for every word on every page load would be
       almost entirely wasted — the same reason the flashcard bank fetches its
       examples on open. Declared BEFORE the {studyVocabulary} delete route is
       not needed here (different verb), but keep it above any future GET on
       that prefix. */
    Route::get('/study-vocabulary/{studyVocabulary}/explain', [StudyVocabularyController::class, 'explain']);
    Route::delete('/study-vocabulary/{studyVocabulary}', [StudyVocabularyController::class, 'destroy']);

    Route::post('/study-units/{studyUnit}/texts', [StudyTextController::class, 'store']);
    Route::delete('/study-texts/{studyText}', [StudyTextController::class, 'destroy']);
    Route::post('/study-texts/{studyText}/lines', [StudyTextController::class, 'storeLine']);
    Route::put('/study-texts/{studyText}/voices', [StudyTextController::class, 'voices']);
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

    /* Where the learner is in their level, and today's three goals — one card,
       so one request against a Dashboard that already fans out to eight.
       Beside the activity routes because it answers the same question from the
       other end: that one says how much has been done, this says what is left.
       Nothing is stored; every figure is counted. See the controller. */
    Route::get('/learning-plan', [LearningPlanController::class, 'index']);

    /* Today's quests. The Dashboard reads them inside /learning-plan (that
       page already fans out to eight requests); these are the writes plus a
       standalone read for anything else that wants them. */
    Route::get('/daily-quests', [\App\Http\Controllers\Api\DailyQuestController::class, 'index']);
    Route::get('/daily-quests/{dailyQuest}/options', [\App\Http\Controllers\Api\DailyQuestController::class, 'options']);
    Route::post('/daily-quests/{dailyQuest}/change', [\App\Http\Controllers\Api\DailyQuestController::class, 'change']);
    Route::put('/daily-quests/{dailyQuest}/target', [\App\Http\Controllers\Api\DailyQuestController::class, 'target']);

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

    /*
     * The floating Chinese practice assistant.
     *
     * `status` is plain: the widget asks once whether a key is configured, so
     * an install without one shows no button at all rather than one that only
     * ever errors. The send route carries the `ai` throttle on top of the
     * group's own — it spends a metered third-party quota, not a query.
     */
    /* The signed-in route to the same thing. Settings can only CHANGE a
       password and that form needs the current one, which is no use to
       someone signed in on a remembered device who cannot recall it. */
    Route::post('/user/password/reset-link', [PasswordResetController::class, 'sendCodeToSelf']);

    /* Confirming the address after sign-up. Both read the email off the
       session rather than the request, so neither can be aimed at another
       account. `throttle:auth` on the send caps how fast someone can make
       this server post mail — the general 300/min bucket would allow a
       mail-bomb through an account they already hold. */
    Route::post('/email/send-code', [EmailVerificationController::class, 'send'])
        ->middleware('throttle:auth');
    Route::post('/email/verify', [EmailVerificationController::class, 'confirm']);

    Route::get('/practice-chat/status', [PracticeChatController::class, 'status']);
    Route::post('/practice-chat', [PracticeChatController::class, 'store'])->middleware('throttle:ai');

    // Study's spoken audio. Made once per word or line, then a static file.
    Route::post('/study-speech', [\App\Http\Controllers\Api\StudySpeechController::class, 'store'])->middleware('throttle:speech');
});
