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
      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Special Powers
      </h3>
      <div className="space-y-4">
        {powers
          .sort((a, b) => a.order - b.order)
          .map((p, idx) => (
            <div key={p.id} className="card p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold">
                  {idx + 1}
                </div>
                <span className="text-xs font-medium text-slate-500">Power #{idx + 1}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Heading</label>
                <input
                  className="input-modern text-sm"
                  placeholder="e.g., Battle Fury"
                  value={p.heading}
                  onChange={(e) => update(p.id, { heading: e.target.value })}
                  onBlur={(e) => onCommitPower?.({ ...p, heading: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
                <textarea
                  className="textarea-modern text-sm h-24"
                  placeholder="Describe the power's effect..."
                  value={p.body}
                  onChange={(e) => update(p.id, { body: e.target.value })}
                  onBlur={(e) => onCommitPower?.({ ...p, body: e.target.value })}
                />
              </div>
            </div>
          ))}
      </div>
    </section>
  )
}
