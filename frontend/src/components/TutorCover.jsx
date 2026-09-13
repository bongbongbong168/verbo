import './TutorCover.css'

/**
 * A tutor's cover image, with a generated stand-in when they have no photo.
 *
 * EXTRACTED BECAUSE ONE COPY HAD IT AND THE OTHER DID NOT — the exact drift
 * `ArticleCover`, `EditDrawer`, `SectionToggle` and `ReaderSwitch` were each
 * pulled out for. The Dashboard's "Recommend Teachers" card already solved the
 * photo-less tutor with a tone-keyed cover and an oversized initial; the
 * profile page's "Teacher you may like" strip still rendered
 * `{t.photo_url && <img/>}`, so a tutor without a photo got a bare grey
 * rectangle — the largest thing on the card, saying nothing. Same data, same
 * question, two answers.
 *
 * The tone is keyed to the tutor's OWN id, never to the card's position, so a
 * tutor looks the same wherever they appear. `Number()` because SQLite hands
 * ids back as strings on list endpoints, and `'3' % 5` would work by coercion
 * while reading as a mistake.
 *
 * The caller sets the box — height on the Dashboard, `aspect-ratio` on the
 * profile page — because those genuinely differ; this owns what is drawn
 * inside it.
 */
export default function TutorCover({ id, photoUrl, name, className = '' }) {
  return (
    <span className={`tc ${className}`.trim()} data-tone={Number(id) % 5}>
      {photoUrl ? (
        <img src={photoUrl} alt="" />
      ) : (
        <span className="tc-mark" aria-hidden="true">
          {(name || '?').charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  )
}
