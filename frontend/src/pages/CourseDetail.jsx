import { useNavigate, useParams } from 'react-router-dom'
import CourseDialog from '../components/CourseDialog'

/**
 * `/courses/:id` — a direct link to one group course.
 *
 * The course itself is the popup card (`components/CourseDialog`), the same one
 * a course row opens on a tutor's page: a course and a private lesson are two
 * shapes of one product, so they are chosen in the same card rather than one
 * popping up and the other taking over the screen.
 *
 * This route exists because a course is linked to from outside that page — a
 * message thread's context card and the profile's course list both point here.
 * Closing goes back to wherever the link was followed from.
 */
export default function CourseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  return <CourseDialog courseId={id} onClose={() => navigate(-1)} />
}
