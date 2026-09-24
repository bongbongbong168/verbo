import { Routes, Route, Navigate } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import VocabularyBank from "./pages/VocabularyBank";
import Scan from "./pages/Scan";
import ScanDocument from "./pages/ScanDocument";
import SharedScan from "./pages/SharedScan";
import Read from "./pages/Read";
import ReadArticle from "./pages/ReadArticle";
import Practice from "./pages/Practice";
import FindTutor from "./pages/FindTutor";
import BecomeTutor from "./pages/BecomeTutor";
import TutorApplications from "./pages/TutorApplications";
import Bookings from "./pages/Bookings";
import Messages from "./pages/Messages";
import CourseDetail from "./pages/CourseDetail";
import Checkout from "./pages/Checkout";
import TutorProfileDetail from "./pages/TutorProfileDetail";
import Podcast from "./pages/Podcast";
import PodcastEpisode from "./pages/PodcastEpisode";
import Study from "./pages/Study";
import StudyLevel from "./pages/StudyLevel";
import StudyUnit from "./pages/StudyUnit";
import StudyQuizPage from "./pages/StudyQuizPage";
import Notifications from "./pages/Notifications";
import Classes from "./pages/Classes";
import Classroom from "./pages/Classroom";
import Profile from "./pages/Profile";
import SavedArticles from "./pages/SavedArticles";
import Settings from "./pages/Settings";
import Upgrade from "./pages/Upgrade";
import SubscriptionSuccess from "./pages/SubscriptionSuccess";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
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
        <Route path="/upgrade/success" element={<SubscriptionSuccess />} />
      </Route>
    </Routes>
  );
}

export default App;
