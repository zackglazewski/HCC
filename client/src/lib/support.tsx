const defaultKoFiUrl = 'https://ko-fi.com/D7U020RMVB'
const koFiUrl = (import.meta.env.VITE_KOFI_URL as string | undefined)?.trim() || defaultKoFiUrl

type SupportLinkProps = {
  compact?: boolean
}

export function SupportLink({ compact = false }: SupportLinkProps) {
  if (!koFiUrl) return null

  return (
    <a
      href={koFiUrl}
      target="_blank"
      rel="noreferrer"
      className={compact ? 'btn-icon !p-1.5 sm:!p-2' : 'btn-secondary text-sm inline-flex items-center gap-1.5'}
      title="Leave a Tip on Ko-fi"
      aria-label="Leave a Tip on Ko-fi"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h10v6a4 4 0 01-4 4H9a4 4 0 01-4-4V8z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9h1.5a2.5 2.5 0 010 5H15" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 5h6" />
      </svg>
      {compact ? (
        <span className="sr-only">Leave a Tip</span>
      ) : (
        <>
          <span className="hidden sm:inline">Leave a Tip</span>
          <span className="sm:hidden">Tip</span>
        </>
      )}
    </a>
  )
}
