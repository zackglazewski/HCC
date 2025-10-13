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
      <header className="header-glass sticky top-0 z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Heroscape Card Editor
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Create custom cards for your armies</p>
          </div>
          <div className="flex items-center gap-3">
            {!isAuthenticated && (
              <Link className="btn-primary" to="/editor?new=1">
                <svg className="inline-block w-4 h-4 mr-2 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Guest Card
              </Link>
            )}
            {isAuthenticated ? (
              <>
                <button className="btn-primary" onClick={onNew}>
                  <svg className="inline-block w-4 h-4 mr-2 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Card
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                >
                  Log out
                </button>
              </>
            ) : !isLoading ? (
              <button
                className="btn-primary"
                onClick={() => {
                  try { sessionStorage.setItem('hcc:returnTo', window.location.pathname + window.location.search) } catch {}
                  loginWithRedirect({ appState: { returnTo: window.location.pathname + window.location.search } })
                }}
              >
                Sign in
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="flex-1 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          {!isAuthenticated && (
            <div className="mb-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl animate-in">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">Guest Mode</h3>
                  <p className="text-slate-600 text-sm">
                    Sign in to save and manage your projects across devices.
                  </p>
                </div>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="spinner mb-4"></div>
                <p className="text-slate-500">Loading your projects...</p>
              </div>
            </div>
          ) : cards.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">No projects yet</h3>
              <p className="text-slate-500 mb-6">Create your first Heroscape card to get started</p>
              {isAuthenticated ? (
                <button className="btn-primary" onClick={onNew}>
                  <svg className="inline-block w-4 h-4 mr-2 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create New Card
                </button>
              ) : (
                <Link className="btn-primary inline-block" to="/editor?new=1">
                  <svg className="inline-block w-4 h-4 mr-2 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Guest Card
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {cards.map((c, idx) => (
                <div
                  key={c.id}
                  className="card-interactive group animate-in"
                  style={{ animationDelay: `${idx * 50}ms` }}
                  onClick={() => nav(`/editor/${c.id}`)}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 text-lg mb-1 truncate group-hover:text-blue-600 transition-colors">
                          {c.title}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Updated {new Date(c.updated_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                      <Link
                        className="flex-1 text-center px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        to={`/editor/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open
                      </Link>
                      <button
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                        onClick={async (e) => {
                          e.stopPropagation()
                          const title = prompt('Rename project', c.title)
                          if (!title) return
                          const token = await getAccessTokenSilently().catch(() => null)
                          const updated = await patchCard(c.id, { title }, token)
                          setCards((list) => list.map((x) => (x.id === c.id ? updated : x)))
                        }}
                        title="Rename"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (!confirm('Delete this project?')) return
                          const token = await getAccessTokenSilently().catch(() => null)
                          await deleteCard(c.id, token)
                          setCards((list) => list.filter((x) => x.id !== c.id))
                        }}
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
