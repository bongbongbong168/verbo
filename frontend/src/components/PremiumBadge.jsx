import './PremiumBadge.css'

/** The one Pro mark, used wherever Verbo marks paid content. */
export default function PremiumBadge({ inline = false }) {
  return <span className={`pb-premium${inline ? ' pb-premium-inline' : ''}`}>Pro</span>
}
