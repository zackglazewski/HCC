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
      <h3 className="font-semibold">Special Powers</h3>
      {powers
        .sort((a, b) => a.order - b.order)
        .map((p) => (
          <div key={p.id} className="space-y-2">
            <input
              className="w-full border rounded px-2 py-1"
              placeholder="Heading"
              value={p.heading}
              onChange={(e) => update(p.id, { heading: e.target.value })}
              onBlur={(e) => onCommitPower?.({ ...p, heading: e.target.value })}
            />
            <textarea
              className="w-full border rounded px-2 py-1 h-20"
              placeholder="Body"
              value={p.body}
              onChange={(e) => update(p.id, { body: e.target.value })}
              onBlur={(e) => onCommitPower?.({ ...p, body: e.target.value })}
            />
          </div>
        ))}
    </section>
  )
}
