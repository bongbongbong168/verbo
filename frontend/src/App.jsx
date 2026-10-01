import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import { PageSkeleton } from './components/Skeleton'

/* Pages are only needed after their route is opened. Keeping them out of the
   first bundle means signing in does not download OCR, checkout, podcast and
   classroom code all at once. Layout stays eager because it is the shell every
   signed-in route immediately needs. */
const Register = lazy(() => import("./pages/Register"));
const Login = lazy(() => import("./pages/Login"));
const GoogleCallback = lazy(() => import("./pages/GoogleCallback"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const VocabularyBank = lazy(() => import("./pages/VocabularyBank"));
const Scan = lazy(() => import("./pages/Scan"));
const ScanDocument = lazy(() => import("./pages/ScanDocument"));
const SharedScan = lazy(() => import("./pages/SharedScan"));
const Read = lazy(() => import("./pages/Read"));
const ReadArticle = lazy(() => import("./pages/ReadArticle"));
const Practice = lazy(() => import("./pages/Practice"));
const FindTutor = lazy(() => import("./pages/FindTutor"));
const BecomeTutor = lazy(() => import("./pages/BecomeTutor"));
const TutorApplications = lazy(() => import("./pages/TutorApplications"));
const Bookings = lazy(() => import("./pages/Bookings"));
const Messages = lazy(() => import("./pages/Messages"));
const CourseDetail = lazy(() => import("./pages/CourseDetail"));
const Checkout = lazy(() => import("./pages/Checkout"));
const TutorProfileDetail = lazy(() => import("./pages/TutorProfileDetail"));
const Podcast = lazy(() => import("./pages/Podcast"));
const PodcastEpisode = lazy(() => import("./pages/PodcastEpisode"));
const Study = lazy(() => import("./pages/Study"));
const StudyLevel = lazy(() => import("./pages/StudyLevel"));
const StudyUnit = lazy(() => import("./pages/StudyUnit"));
const StudyQuizPage = lazy(() => import("./pages/StudyQuizPage"));
const ContentQuizPage = lazy(() => import("./pages/ContentQuizPage"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Classes = lazy(() => import("./pages/Classes"));
const Classroom = lazy(() => import("./pages/Classroom"));
const Profile = lazy(() => import("./pages/Profile"));
const SavedArticles = lazy(() => import("./pages/SavedArticles"));
const Settings = lazy(() => import("./pages/Settings"));
const Upgrade = lazy(() => import("./pages/Upgrade"));
const SubscriptionSuccess = lazy(() => import("./pages/SubscriptionSuccess"));
const UpgradeCheckout = lazy(() => import("./pages/UpgradeCheckout"));

/* Warm only the most common learner destinations. Prefetching every route
   downloaded admin, messaging and media code even when it was never opened,
   competing with the current page on phones and slower connections. */
const PREFETCH = [
  () => import("./pages/Dashboard"),
  () => import("./pages/Read"),
  () => import("./pages/Study"),
  () => import("./pages/VocabularyBank"),
];

function prefetchPages() {
  if (navigator.connection?.saveData || /(^|\b)(slow-2g|2g|3g)(\b|$)/.test(navigator.connection?.effectiveType || '')) return;
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1200));
  idle(async () => {
    for (const load of PREFETCH) {
      if (document.visibilityState === 'hidden') break;
      try {
        await load();
      } catch {
        // A failed prefetch just means that page loads on demand, as before.
      }
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("load", prefetchPages, { once: true });
}

function RouteLoading() {
  return <PageSkeleton />;
}

function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/google" element={<GoogleCallback />} />
      {/* Public, and outside ProtectedRoute: someone who cannot sign in is by
          definition not signed in. Both halves — ask for the code, then spend
          it — live on this ONE route, because the code is typed back into the
          tab that asked for it and a second route would invite a refresh
          between the two. */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      {/* Public on purpose — the share token in the URL is the credential, so
          this must sit OUTSIDE ProtectedRoute and outside Layout (a recipient
          has no account, so there is no sidebar to render). */}
      <Route path="/shared/scan/:shareToken" element={<SharedScan />} />
      {/* Inside ProtectedRoute but OUTSIDE Layout: onboarding is a focused
          flow with its own shell, and a sidebar full of places to go is the
          opposite of what it is for. Confirming the email is the same kind of
          step and sits immediately BEFORE it — it is about the account
          itself, where onboarding is about preferences. */}
      <Route
        path="/verify-email"
        element={
          <ProtectedRoute>
            <VerifyEmail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vocabulary" element={<VocabularyBank />} />
        {/* The bank replaced the flashcard page: reviewing is now something
            you do inside it rather than a separate collection. Kept as a
            redirect so older links and bookmarks still land somewhere real. */}
        <Route
          path="/flashcards"
          element={<Navigate to="/vocabulary" replace />}
        />
        <Route path="/scan" element={<Scan />} />
        <Route path="/scan/:id" element={<ScanDocument />} />
        <Route path="/read" element={<Read />} />
        <Route path="/read/:id" element={<ReadArticle />} />
        <Route path="/read/:id/quiz" element={<ContentQuizPage kind="articles" />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/find-tutor" element={<FindTutor />} />
        <Route path="/find-tutor/:id" element={<TutorProfileDetail />} />
        <Route path="/become-a-tutor" element={<BecomeTutor />} />
        {/* Admin-gated inside the page as well as on every endpoint it calls. */}
        <Route path="/tutor-applications" element={<TutorApplications />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/courses/:id" element={<CourseDetail />} />
        {/* One checkout for both flows; `kind` is "lesson" or "course". */}
        <Route path="/checkout/:kind/:id" element={<Checkout />} />
        <Route path="/podcast" element={<Podcast />} />
        <Route path="/podcast/:id" element={<PodcastEpisode />} />
        <Route path="/podcast/:id/quiz" element={<ContentQuizPage kind="podcasts" />} />
        <Route path="/study" element={<Study />} />
        <Route path="/study/units/:id/quiz" element={<StudyQuizPage />} />
        <Route path="/study/units/:id" element={<StudyUnit />} />
        <Route path="/study/:id" element={<StudyLevel />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/saved" element={<SavedArticles />} />
        <Route path="/classes" element={<Classes />} />
        {/* Declared after /classes so the list is not shadowed. */}
        <Route path="/classes/:id" element={<Classroom />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        {/* Inside Layout like every other content page — the rail stays put,
            which is what makes this read as part of the app rather than a
            marketing page bolted on beside it. */}
        <Route path="/upgrade" element={<Upgrade />} />
        <Route path="/upgrade/checkout" element={<UpgradeCheckout />} />
        <Route path="/upgrade/success" element={<SubscriptionSuccess />} />
      </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
