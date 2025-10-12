import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { createCard, deleteCard, listCards, patchCard, ServerCard } from '../lib/api'

export default function ProjectsPage() {
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently, logout } = useAuth0()
  const [cards, setCards] = useState<ServerCard[]>([])
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    ;(async () => {
      if (!isAuthenticated) return setCards([])
      setLoading(true)
      try {
        const token = await getAccessTokenSilently().catch(() => null)
        const data = await listCards(token)
        setCards(data)
      } finally {
        setLoading(false)
      }
    })()
  }, [isAuthenticated, getAccessTokenSilently])

  async function onNew() {
    const token = await getAccessTokenSilently().catch(() => null)
    const created = await createCard({ title: 'Untitled Card', general: 'vydar' }, token)
    nav(`/editor/${created.id}`)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b">
        <div className="font-semibold">Projects</div>
        <div className="flex items-center gap-2">
          {!isAuthenticated && (
            <Link className="px-2 py-1 border rounded" to="/editor?new=1">New Guest Card</Link>
          )}
          {isAuthenticated ? (
            <>
              <button className="px-2 py-1 border rounded" onClick={onNew}>New</button>
              <button
                className="px-2 py-1 border rounded"
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              >
                Log out
              </button>
            </>
          ) : !isLoading ? (
            <button
              className="px-2 py-1 border rounded"
              onClick={() => {
                try { sessionStorage.setItem('hcc:returnTo', window.location.pathname + window.location.search) } catch {}
                loginWithRedirect({ appState: { returnTo: window.location.pathname + window.location.search } })
              }}
            >
              Sign in
            </button>
          ) : null}
        </div>
      </header>
      <main className="p-6">
        {!isAuthenticated && (
          <div className="text-gray-600 mb-4">Sign in to save and manage your projects.</div>
        )}
        {loading && <div>Loading…</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => (
            <div key={c.id} className="border rounded p-3 flex flex-col">
              <div className="font-medium mb-2 line-clamp-1">{c.title}</div>
              <div className="text-xs text-gray-500 mb-3">Updated {new Date(c.updated_at).toLocaleString()}</div>
              <div className="mt-auto flex gap-2">
                <Link className="px-2 py-1 border rounded" to={`/editor/${c.id}`}>
                  Open
                </Link>
                <button
                  className="px-2 py-1 border rounded"
                  onClick={async () => {
                    const title = prompt('Rename project', c.title)
                    if (!title) return
                    const token = await getAccessTokenSilently().catch(() => null)
                    const updated = await patchCard(c.id, { title }, token)
                    setCards((list) => list.map((x) => (x.id === c.id ? updated : x)))
                  }}
                >
                  Rename
                </button>
                <button
                  className="px-2 py-1 border rounded"
                  onClick={async () => {
                    if (!confirm('Delete this project?')) return
                    const token = await getAccessTokenSilently().catch(() => null)
                    await deleteCard(c.id, token)
                    setCards((list) => list.filter((x) => x.id !== c.id))
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
