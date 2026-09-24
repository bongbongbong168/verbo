import './ArticleCover.css'

/* A cover for every article without anyone uploading one.
 *
 * Photography is the one part of a Read card that cannot be derived from the
 * text, and 15 of 18 articles had none — so every shelf was a column of the
 * same lavender block. These are not fake photos: each topic gets its own
 * gradient and the character it turns on, so a cover says which shelf you are
 * looking at rather than pretending to depict something.
 *
 * An uploaded image still wins wherever one exists. This is the floor, not a
 * replacement.
 *
 * The key is the topic, so a topic with no entry here still gets the default
 * pairing rather than a blank cover. */
export const TOPIC_ART = {
  'Everyday Chinese': '日',
  Culture: '文',
  Entertainment: '乐',
  Stories: '事',
  Travel: '行',
  Business: '商',
}

export function topicKey(category) {
  return TOPIC_ART[category] ? category.toLowerCase().replace(/\s+/g, '-') : 'default'
}

/* FORMAT, not topic — `articles.type`. Lives here because the badge that shows
   it is part of the cover, so the label and the thing that draws it cannot end
   up in two places disagreeing about the wording. */
export const TYPE_LABELS = {
  article: 'Article',
  story: 'Story',
  funfact: 'Fun fact',
}

/**
 * The cover block: uploaded image if there is one, otherwise the topic's
 * gradient and character, with the format badge over the top.
 *
 * @param article  needs `category`, `image_url` and `type`
 * @param small    the Dashboard's pick-up size rather than a Read shelf card
 */
export default function ArticleCover({ article, small = false }) {
  return (
    <div className={`ac${small ? ' ac-sm' : ''}`} data-topic={topicKey(article.category)}>
      {article.image_url ? (
        <img src={article.image_url} alt="" />
      ) : (
        /* aria-hidden: it is a texture standing in for a photograph, and a
           screen reader announcing a lone character here would be noise. */
        <span className="ac-glyph" aria-hidden="true">
          {TOPIC_ART[article.category] || '读'}
        </span>
      )}
      {(article.type || article.is_premium) && (
        <span className="ac-badges">
          {article.type && (
            <span className="ac-format">{TYPE_LABELS[article.type] || article.type}</span>
          )}
          {article.is_premium && <span className="ac-pro">Pro</span>}
        </span>
      )}
    </div>
  )
}
