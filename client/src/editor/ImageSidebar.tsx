import { ImageLayer } from './types'

export function ImageSidebar({
  images,
  selectedId,
  onSelect,
  onUpload,
  onDelete,
  onScale,
  onNudge,
  onReorderList,
}: {
  images: ImageLayer[]
  selectedId?: string | null
  onSelect: (id: string) => void
  onUpload: (dataUrl: string, name?: string) => void
  onDelete: (id: string) => void
  onScale: (id: string, delta: number) => void
  onNudge: (id: string, dx: number, dy: number) => void
  onReorderList: (ids: string[]) => void
}) {
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      onUpload(reader.result as string, file.name)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const sorted = [...images].sort((a, b) => a.order - b.order)
  const dragIdRef = (typeof window !== 'undefined') ? (window as any).__imgDragIdRef || { current: null as string | null } : { current: null as string | null }
  if ((window as any)) (window as any).__imgDragIdRef = dragIdRef

  function beginDrag(e: React.DragEvent<HTMLLIElement>, id: string) {
    dragIdRef.current = id
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch {}
  }
  function overDrag(e: React.DragEvent<HTMLLIElement>) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  function dropOn(e: React.DragEvent<HTMLLIElement>, targetId: string) {
    e.preventDefault()
    const src = ((): string | null => {
      try { const d = e.dataTransfer.getData('text/plain'); if (d) return d } catch {}
      return dragIdRef.current
    })()
    if (!src || src === targetId) { dragIdRef.current = null; return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    const ids = sorted.map(i => i.id)
    const from = ids.indexOf(src)
    let to = ids.indexOf(targetId)
    if (!before) to = to + 1
    if (from < 0) return
    ids.splice(from, 1)
    if (to > ids.length) to = ids.length
    ids.splice(to, 0, src)
    onReorderList(ids)
    dragIdRef.current = null
  }

  return (
    <aside className="w-80 sidebar-modern p-6 space-y-6 overflow-y-auto h-full min-h-0">
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Images
        </h3>
        <label className="block">
          <input
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
            id="image-upload"
          />
          <div className="btn-primary w-full text-center cursor-pointer flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Upload Image
          </div>
        </label>
      </div>

      {selectedId && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700">Position Controls</h4>
          <div className="grid grid-cols-3 gap-2">
            <div></div>
            <button
              className="btn-icon"
              onClick={() => selectedId && onNudge(selectedId, 0, -5)}
              title="Move up"
            >
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <div></div>
            <button
              className="btn-icon"
              onClick={() => selectedId && onNudge(selectedId, -5, 0)}
              title="Move left"
            >
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center justify-center text-xs text-slate-400">Nudge</div>
            <button
              className="btn-icon"
              onClick={() => selectedId && onNudge(selectedId, 5, 0)}
              title="Move right"
            >
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div></div>
            <button
              className="btn-icon"
              onClick={() => selectedId && onNudge(selectedId, 0, 5)}
              title="Move down"
            >
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div></div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Render Order (drag to reorder)
        </h4>
        {sorted.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            No images yet
          </div>
        ) : (
          <ul className="space-y-2">
            {sorted.map((img) => (
              <li
                key={img.id}
                draggable
                onDragStart={(e) => beginDrag(e, img.id)}
                onDragOver={overDrag}
                onDrop={(e) => dropOn(e, img.id)}
                className={`${selectedId === img.id ? 'layer-item-selected' : 'layer-item'} p-3`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                  <button
                    className="text-left flex-1 min-w-0 truncate text-sm font-medium text-slate-900"
                    title={img.name || 'Image'}
                    onClick={() => onSelect(img.id)}
                  >
                    {img.name || 'Image'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="flex-1 btn-icon text-xs"
                    onClick={() => onScale(img.id, -0.1)}
                    title="Scale down"
                  >
                    <svg className="w-3 h-3 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </button>
                  <button
                    className="flex-1 btn-icon text-xs"
                    onClick={() => onScale(img.id, 0.1)}
                    title="Scale up"
                  >
                    <svg className="w-3 h-3 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button
                    className="flex-1 btn-danger text-xs"
                    onClick={() => onDelete(img.id)}
                    title="Delete"
                  >
                    <svg className="w-3 h-3 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
