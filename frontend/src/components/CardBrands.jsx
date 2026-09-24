/* Shared by both checkouts (Pro and lessons), so the card form and the
   accepted-brand marks look identical wherever Verbo takes a payment. */

/* Matches the app's inputs: Hellix, hairline lavender borders, 12px radius,
   lavender focus ring. Fonts fall back to the system face inside the frames. */
export const CARD_APPEARANCE = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#6a6191',
    colorText: '#1c1730',
    colorTextSecondary: '#726c88',
    colorTextPlaceholder: '#a09bb3',
    colorDanger: '#b02a2a',
    colorBackground: '#ffffff',
    fontFamily: 'Hellix, system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSizeBase: '15px',
    borderRadius: '12px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid #e7e3f6', boxShadow: 'none', padding: '12px 14px' },
    '.Input:focus': { border: '1px solid #a89ce3', boxShadow: '0 0 0 3px rgba(168, 156, 227, 0.28)' },
    '.Input--invalid': { border: '1px solid #b02a2a', boxShadow: 'none' },
    '.Label': { fontWeight: '600', color: '#1c1730', marginBottom: '6px' },
    '.Tab': { border: '1px solid #e7e3f6', boxShadow: 'none' },
    '.Tab--selected': { border: '1px solid #a89ce3', boxShadow: '0 0 0 3px rgba(168, 156, 227, 0.22)' },
  },
}

/* Card-brand marks, drawn rather than fetched. */
export function VisaMark() {
  return (
    <svg className="uc-brand" viewBox="0 0 48 30" role="img" aria-label="Visa">
      <rect width="48" height="30" rx="5" fill="#fff" stroke="#e7e3f6" />
      <text x="24" y="20" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="12.5" fontStyle="italic" fontWeight="700" fill="#1a1f71">VISA</text>
    </svg>
  )
}
export function MastercardMark() {
  return (
    <svg className="uc-brand" viewBox="0 0 48 30" role="img" aria-label="Mastercard">
      <rect width="48" height="30" rx="5" fill="#fff" stroke="#e7e3f6" />
      <circle cx="20" cy="15" r="8" fill="#eb001b" />
      <circle cx="28" cy="15" r="8" fill="#f79e1b" />
      <path d="M24 8.1a8 8 0 0 1 0 13.8 8 8 0 0 1 0-13.8z" fill="#ff5f00" />
    </svg>
  )
}
