import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { createCard, deleteCard, listCards, patchCard, ServerCard } from '../lib/api'
import { CardState } from '../editor/types'

export function ProjectsPanel({
  open,
  onClose,
  onOpenCard,
  current,
}: {
  open: boolean
  onClose: () => void
  onOpenCard: (server: ServerCard) => void
  current?: CardState
}) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [cards, setCards] = useState<ServerCard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!isAuthenticated) return setCards([])
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessTokenSilently().catch(() => null)
      const data = await listCards(token)
      setCards(data)
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) refresh()
  }, [open])

  async function onNew() {
    try {
      const token = await getAccessTokenSilently().catch(() => null)
      const created = await createCard({ title: 'Untitled Card', general: current?.general || 'vydar' }, token)
      setCards((c) => [created, ...c])
    } catch (e) {}
  }

  async function onRename(c: ServerCard, title: string) {
    try {
      const token = await getAccessTokenSilently().catch(() => null)
      const updated = await patchCard(c.id, { title }, token)
      setCards((list) => list.map((x) => (x.id === c.id ? updated : x)))
    } catch (e) {}
  }

  async function onDeleteClick(c: ServerCard) {
    try {
      const token = await getAccessTokenSilently().catch(() => null)
      await deleteCard(c.id, token)
      setCards((list) => list.filter((x) => x.id !== c.id))
    } catch (e) {}
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center p-3 sm:p-8 z-50">
      <div className="bg-white w-full max-w-2xl rounded-lg shadow-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="font-semibold">Projects</div>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 border rounded" onClick={onNew} disabled={!isAuthenticated}>
              New
            </button>
            <button className="px-2 py-1 border rounded" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="p-3 overflow-y-auto flex-1">
          {!isAuthenticated && <div className="text-sm text-gray-600">Sign in to manage your projects.</div>}
          {loading && <div className="text-sm">Loading…</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <ul className="divide-y">
            {cards.map((c) => (
              <li key={c.id} className="py-2 flex items-center gap-2">
                <button className="flex-1 text-left min-w-0" onClick={() => onOpenCard(c)}>
                  <div className="font-medium truncate">{c.title}</div>
                  <div className="text-xs text-gray-500">{new Date(c.updated_at).toLocaleString()}</div>
                </button>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    className="px-2 py-1 border rounded text-sm"
                    onClick={() => {
                      const title = prompt('Rename project', c.title)
                      if (title) onRename(c, title)
                    }}
                  >
                    Rename
                  </button>
                  <button className="px-2 py-1 border rounded text-sm" onClick={() => onDeleteClick(c)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

