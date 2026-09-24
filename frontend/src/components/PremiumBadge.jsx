import './PremiumBadge.css'

/** The compact premium marker used wherever Verbo marks paid content. */
export default function PremiumBadge({ inline = false }) {
  return (
    <span className={`pb-premium${inline ? ' pb-premium-inline' : ''}`}>
      <span className="pb-premium-text">Pro</span>
    </span>
  )
}
