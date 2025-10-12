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
    <section className="space-y-4 pb-6 border-b border-slate-200">
      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
        Custom Theme
      </h3>

      {saved.length > 0 && (
        <div className="card p-4 space-y-3">
          <label className="block text-xs font-medium text-slate-600">Saved Themes</label>
          <select
            className="input-modern text-sm w-full"
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">Select a saved theme...</option>
            {saved.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedId}
              onClick={() => selectedId && onApplySaved(selectedId)}
            >
              Apply
            </button>
            <button
              className="btn-danger text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedId}
              onClick={() => selectedId && onDeleteSaved(selectedId)}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <label className="block text-xs font-medium text-slate-600">Color Palette</label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-2">Primary</label>
            <div className="relative">
              <input
                type="color"
                value={value.primary}
                onChange={(e) => onChange({ ...value, primary: e.target.value })}
                className="w-full h-12 rounded-lg border-2 border-slate-200 cursor-pointer hover:border-blue-400 transition-colors"
              />
              <div className="absolute inset-x-0 -bottom-6 text-[10px] text-center text-slate-400 font-mono">
                {value.primary.toUpperCase()}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-2">Secondary</label>
            <div className="relative">
              <input
                type="color"
                value={value.secondary}
                onChange={(e) => onChange({ ...value, secondary: e.target.value })}
                className="w-full h-12 rounded-lg border-2 border-slate-200 cursor-pointer hover:border-blue-400 transition-colors"
              />
              <div className="absolute inset-x-0 -bottom-6 text-[10px] text-center text-slate-400 font-mono">
                {value.secondary.toUpperCase()}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-2">Background</label>
            <div className="relative">
              <input
                type="color"
                value={value.background}
                onChange={(e) => onChange({ ...value, background: e.target.value })}
                className="w-full h-12 rounded-lg border-2 border-slate-200 cursor-pointer hover:border-blue-400 transition-colors"
              />
              <div className="absolute inset-x-0 -bottom-6 text-[10px] text-center text-slate-400 font-mono">
                {value.background.toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-3 mt-8">
        <label className="block text-xs font-medium text-slate-600">Save Current Theme</label>
        <input
          className="input-modern text-sm"
          placeholder="Enter theme name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              onSaveNew(name.trim())
              setName('')
            }
          }}
        />
        <button
          className="btn-primary w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!name.trim()}
          onClick={() => {
            onSaveNew(name.trim())
            setName('')
          }}
        >
          <svg className="inline-block w-4 h-4 mr-2 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Save Theme
        </button>
      </div>
    </section>
  )
}
