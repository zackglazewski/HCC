import { General } from './types'

const GENERALS: General[] = ['custom', 'aquilla', 'einar', 'jandar', 'ullar', 'utgar', 'valkrill', 'vydar']

export function TemplateSelector({ value, onChange }: { value: General; onChange: (g: General) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-600 w-24">Template</label>
      <select className="border rounded px-2 py-1" value={value} onChange={(e) => onChange(e.target.value as General)}>
        {GENERALS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  )
}
