import { General } from './types'

const GENERALS: General[] = ['custom', 'aquilla', 'einar', 'jandar', 'ullar', 'utgar', 'valkrill', 'vydar']

export function TemplateSelector({ value, onChange }: { value: General; onChange: (g: General) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs sm:text-sm font-medium text-slate-700 flex items-center gap-1.5 flex-shrink-0">
        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
        <span className="hidden sm:inline">Theme</span>
      </label>
      <select
        className="input-modern text-xs sm:text-sm cursor-pointer capitalize"
        value={value}
        onChange={(e) => onChange(e.target.value as General)}
      >
        {GENERALS.map((g) => (
          <option key={g} value={g} className="capitalize">
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </option>
        ))}
      </select>
    </div>
  )
}
