import { Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { SupportLink } from '../lib/support'
import { FileExplorer } from '../projects/FileExplorer'

export default function ProjectsPage() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout } = useAuth0()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="header-glass sticky top-0 z-10 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Heroscape Card Editor Test
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 hidden sm:block">Create custom cards for your armies</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <SupportLink />
            {!isAuthenticated && (
              <Link className="btn-primary text-sm" to="/editor?new=1">
                <svg className="inline-block w-4 h-4 mr-1 sm:mr-2 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">New Guest Card</span>
                <span className="sm:hidden">New</span>
              </Link>
            )}
            {isAuthenticated ? (
              <button
                className="btn-secondary text-sm"
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              >
                Log out
              </button>
            ) : !isLoading ? (
              <button
                className="btn-primary text-sm"
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
      <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="spinner mb-4"></div>
                <p className="text-slate-500">Signing you in...</p>
              </div>
            </div>
          ) : isAuthenticated ? (
            <FileExplorer />
          ) : (
            <GuestLanding />
          )}
        </div>
      </main>
    </div>
  )
}

function GuestLanding() {
  return (
    <>
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
              Sign in to save your cards, organize them into folders, and pick up where you left off on any device.
            </p>
          </div>
        </div>
      </div>
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">No projects yet</h3>
        <p className="text-slate-500 mb-6">Create your first Heroscape card to get started</p>
        <Link className="btn-primary inline-block" to="/editor?new=1">
          <svg className="inline-block w-4 h-4 mr-2 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Guest Card
        </Link>
      </div>
    </>
  )
}
