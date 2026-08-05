import { Routes, Route, Navigate } from 'react-router-dom'
import Register from './pages/Register'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Flashcards from './pages/Flashcards'
import Scan from './pages/Scan'
import Read from './pages/Read'
import ReadArticle from './pages/ReadArticle'
import Practice from './pages/Practice'
import FindTutor from './pages/FindTutor'
import TutorProfileDetail from './pages/TutorProfileDetail'
import Podcast from './pages/Podcast'
import PodcastEpisode from './pages/PodcastEpisode'
import Study from './pages/Study'
import StudyLevel from './pages/StudyLevel'
import StudyUnit from './pages/StudyUnit'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/flashcards" element={<Flashcards />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/read" element={<Read />} />
        <Route path="/read/:id" element={<ReadArticle />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/find-tutor" element={<FindTutor />} />
        <Route path="/find-tutor/:id" element={<TutorProfileDetail />} />
        <Route path="/podcast" element={<Podcast />} />
        <Route path="/podcast/:id" element={<PodcastEpisode />} />
        <Route path="/study" element={<Study />} />
        <Route path="/study/units/:id" element={<StudyUnit />} />
        <Route path="/study/:id" element={<StudyLevel />} />
      </Route>
    </Routes>
  )
}

export default App
