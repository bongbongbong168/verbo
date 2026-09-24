import { Link } from 'react-router-dom'
import graduateBot from '../assets/assistant/graduate-bot.png'
import './UsageAllowance.css'

export function formatUsageReset(usage, { includeTime = false, monthStyle = 'long' } = {}) {
  if (!usage) return ''
  const value = usage.resets_at || (usage.reset_date ? `${usage.reset_date}T00:00:00` : null)
  if (!value) return ''
  const reset = new Date(value)
  if (Number.isNaN(reset.getTime())) return ''

  if (includeTime) {
    return `Resets at ${reset.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }

  return `Resets ${reset.toLocaleDateString([], { month: monthStyle, day: 'numeric' })}`
}

export function AllowanceIndicator({ usage, children, className = '' }) {
  if (!usage) return null
  const low = usage.remaining != null && usage.remaining > 0 && usage.remaining <= 3
  const exhausted = usage.available === false

  return (
    <span
      className={`ua-indicator${low ? ' low' : ''}${exhausted ? ' exhausted' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </span>
  )
}

export function UsageLimitState({
  usage,
  title,
  description,
  actionLabel,
  className = '',
  compact = false,
}) {
  if (!usage || usage.available !== false) return null

  return (
    <section className={`ua-limit${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}>
      <img src={graduateBot} alt="" aria-hidden="true" />
      <div className="ua-limit-copy">
        <h3>{title}</h3>
        <p>{description}</p>
        <span>{formatUsageReset(usage, { includeTime: usage.period_type === 'day' })}</span>
      </div>
      {actionLabel && !usage.is_pro && (
        <Link className="ua-limit-action" to="/upgrade">{actionLabel}</Link>
      )}
    </section>
  )
}
