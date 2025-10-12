import { Power } from './types'
import { useEffect } from 'react'

export function PowersEditor({ powers, onChange, onCommitPower }: { powers: Power[]; onChange: (p: Power[]) => void; onCommitPower?: (p: Power) => void }) {
  // Ensure there are editable rows even if powers are empty (e.g., new projects)
  useEffect(() => {
    if (!powers || powers.length === 0) {
      onChange([
        { id: crypto.randomUUID(), order: 0, heading: '', body: '' },
        { id: crypto.randomUUID(), order: 1, heading: '', body: '' },
        { id: crypto.randomUUID(), order: 2, heading: '', body: '' },
        { id: crypto.randomUUID(), order: 3, heading: '', body: '' },
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [powers?.length])
  function update(id: string, patch: Partial<Power>) {
    onChange(powers.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 py-1">
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Special Powers
      </h3>
      <div className="space-y-3">
        {powers
          .sort((a, b) => a.order - b.order)
          .map((p, idx) => (
            <div key={p.id} className="rounded-lg border border-slate-200 p-3">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
                <div className="flex items-center gap-2 lg:col-span-1">
                  <div className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                    {idx + 1}
                  </div>
                  <label className="sr-only" htmlFor={`power-heading-${idx}`}>Heading</label>
                  <input
                    id={`power-heading-${idx}`}
                    className="input-modern text-sm"
                    placeholder="Heading"
                    value={p.heading}
                    onChange={(e) => update(p.id, { heading: e.target.value })}
                    onBlur={(e) => onCommitPower?.({ ...p, heading: e.target.value })}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="sr-only" htmlFor={`power-body-${idx}`}>Description</label>
                  <textarea
                    id={`power-body-${idx}`}
                    className="textarea-modern text-sm min-h-[56px] h-[56px] resize-y"
                    rows={3}
                    placeholder="Description"
                    value={p.body}
                    onChange={(e) => update(p.id, { body: e.target.value })}
                    onBlur={(e) => onCommitPower?.({ ...p, body: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
      </div>
    </section>
  )
}
