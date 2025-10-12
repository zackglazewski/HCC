import React from 'react'

export type CustomTheme = {
  primary: string // hex color #rrggbb
  secondary: string // hex
  background: string // hex
}

export function CustomThemePanel({
  value,
  onChange,
  saved,
  onApplySaved,
  onSaveNew,
  onDeleteSaved,
}: {
  value: CustomTheme
  onChange: (v: CustomTheme) => void
  saved: { id: number; name: string; primary_hex: string; secondary_hex: string; background_hex: string }[]
  onApplySaved: (themeId: number) => void
  onSaveNew: (name: string) => void
  onDeleteSaved: (themeId: number) => void
}) {
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [name, setName] = React.useState('')
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Custom Theme</h3>
      <div className="flex items-center gap-2">
        <label className="w-24 text-sm text-gray-600">Saved</label>
        <select className="border rounded px-2 py-1 flex-1" value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value ? parseInt(e.target.value) : null)}>
          <option value="">— Select a saved theme —</option>
          {saved.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button className="px-2 py-1 border rounded" disabled={!selectedId} onClick={() => selectedId && onApplySaved(selectedId)}>Apply</button>
        <button className="px-2 py-1 border rounded" disabled={!selectedId} onClick={() => selectedId && onDeleteSaved(selectedId)}>Delete</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="w-24 text-sm text-gray-600">Primary</label>
        <input type="color" value={value.primary} onChange={(e) => onChange({ ...value, primary: e.target.value })} />
      </div>
      <div className="flex items-center gap-2">
        <label className="w-24 text-sm text-gray-600">Secondary</label>
        <input type="color" value={value.secondary} onChange={(e) => onChange({ ...value, secondary: e.target.value })} />
      </div>
      <div className="flex items-center gap-2">
        <label className="w-24 text-sm text-gray-600">Background</label>
        <input type="color" value={value.background} onChange={(e) => onChange({ ...value, background: e.target.value })} />
      </div>
      <div className="flex items-center gap-2">
        <label className="w-24 text-sm text-gray-600">Save As</label>
        <input className="border rounded px-2 py-1 flex-1" placeholder="Theme name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="px-2 py-1 border rounded" disabled={!name.trim()} onClick={() => { onSaveNew(name.trim()); setName('') }}>Save</button>
      </div>
    </section>
  )
}
