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
    <aside className="w-72 border-r p-3 space-y-3 overflow-auto">
      <div>
        <input type="file" accept="image/*" onChange={handleUpload} />
      </div>
      <div className="flex items-center gap-2">
        <button
          className="px-2 py-1 border rounded"
          disabled={!selectedId}
          onClick={() => selectedId && onNudge(selectedId, 0, -5)}
        >↑</button>
        <button
          className="px-2 py-1 border rounded"
          disabled={!selectedId}
          onClick={() => selectedId && onNudge(selectedId, -5, 0)}
        >←</button>
        <button
          className="px-2 py-1 border rounded"
          disabled={!selectedId}
          onClick={() => selectedId && onNudge(selectedId, 5, 0)}
        >→</button>
        <button
          className="px-2 py-1 border rounded"
          disabled={!selectedId}
          onClick={() => selectedId && onNudge(selectedId, 0, 5)}
        >↓</button>
      </div>
      <div>
        <h3 className="font-semibold mb-2">Images Render Order</h3>
        <ul className="space-y-2">
          {sorted.map((img) => (
            <li
              key={img.id}
              draggable
              onDragStart={(e) => beginDrag(e, img.id)}
              onDragOver={overDrag}
              onDrop={(e) => dropOn(e, img.id)}
              className={`p-2 border rounded cursor-grab ${selectedId === img.id ? 'bg-blue-50 border-blue-300' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  className="text-left flex-1 min-w-0 truncate"
                  title={img.name || 'Image'}
                  onClick={() => onSelect(img.id)}
                >
                  {img.name || 'Image'}
                </button>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button className="px-1 border rounded" onClick={() => onScale(img.id, -0.1)}>-</button>
                  <button className="px-1 border rounded" onClick={() => onScale(img.id, 0.1)}>+</button>
                  <button className="px-1 border rounded" onClick={() => onDelete(img.id)}>✕</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
