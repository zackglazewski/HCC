import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import EditorPage from './EditorPage'
import { DEFAULT_CARD } from '../editor/types'
import { DEFAULT_CUSTOM_THEME } from '../editor/serverCard'
import { createCard, getCard, patchCard, type ServerCard } from '../lib/api'

// Auth0 is a real network client; the page only needs a signed-in (or guest) user and a token.
const auth = {
  isAuthenticated: true,
  isLoading: false,
  user: undefined,
  getAccessTokenSilently: async () => 'test-token',
  loginWithRedirect: vi.fn(),
  loginWithPopup: vi.fn(),
  logout: vi.fn(),
}
vi.mock('@auth0/auth0-react', () => ({ useAuth0: () => auth }))

// The canvas needs a real 2D context, which jsdom doesn't have. The persistence wiring around it is
// what these tests exercise.
vi.mock('../editor/Canvas', () => ({ EditorCanvas: () => null }))

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    getCard: vi.fn(),
    patchCard: vi.fn(async () => ({})),
    createCard: vi.fn(),
    listThemes: vi.fn(async () => []),
    putThumbnail: vi.fn(async () => ({ updated_at: '' })),
  }
})

/** Autosave debounce in EditorPage, plus a little slack. */
const AUTOSAVE_MS = 1000 + 200

function serverCard(over: Partial<ServerCard> = {}): ServerCard {
  return {
    id: 2,
    user_id: 1,
    folder_id: null,
    title: 'Card B',
    general: 'einar',
    card_name: 'Bee',
    hitbox_json: null,
    theme_primary_hex: null,
    theme_secondary_hex: null,
    theme_background_hex: null,
    created_at: '',
    updated_at: '',
    powers: [],
    images: [],
    ...over,
  }
}

/** What the editor leaves in localStorage after editing card 1 (the "last edited card" snapshot). */
function rememberLastEditedCard(over: Partial<typeof DEFAULT_CARD> = {}) {
  localStorage.setItem('hcc:card', JSON.stringify({ ...DEFAULT_CARD, id: 1, title: 'Card A', ...over }))
}

/** Card `id` arrives from the server after `delayMs` (token refresh + image fetches take time). */
function serveCardAfter(card: ServerCard, delayMs: number) {
  vi.mocked(getCard).mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(card), delayMs)))
}

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/editor/:id" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function patchesTo(cardId: number) {
  return vi.mocked(patchCard).mock.calls.filter(([id]) => id === cardId).map(([, body]) => body)
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  auth.isAuthenticated = true
  vi.mocked(getCard).mockReset()
  vi.mocked(patchCard).mockClear()
  vi.mocked(createCard).mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('opening a card while a different card was the last one edited', () => {
  it('never writes the previously edited card back to the server', async () => {
    // Card 1 was last edited with a custom theme; its real colours live on the server.
    rememberLastEditedCard({ general: 'custom' })
    serveCardAfter(serverCard({ id: 2 }), 1500)

    renderEditor('/editor/2')
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS))

    // Before the fix this held one PATCH resetting card 1's custom theme to the default colours.
    expect(patchesTo(1), 'PATCH bodies sent to card 1 while card 2 was still loading').toEqual([])
    expect(vi.mocked(createCard), 'no card is created on the side').not.toHaveBeenCalled()
    expect(patchesTo(1).some((b) => b.theme_primary_hex === DEFAULT_CUSTOM_THEME.primary)).toBe(false)
  })

  it('does not revert the previous card to a stale local snapshot', async () => {
    // Local snapshot of card 1 says vydar; the user had since switched it to einar (saved server-side).
    rememberLastEditedCard({ general: 'vydar' })
    serveCardAfter(serverCard({ id: 2, general: 'jandar' }), 1500)

    renderEditor('/editor/2')
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS))

    expect(patchesTo(1), 'PATCH bodies sent to card 1').toEqual([])
  })

  it('autosaves the opened card with its own content once it has loaded', async () => {
    rememberLastEditedCard({ general: 'custom' })
    serveCardAfter(serverCard({ id: 2, general: 'einar', title: 'Card B' }), 1500)

    renderEditor('/editor/2')
    // Two steps: React flushes the state set by the load only when an act() scope ends, and the
    // autosave debounce is scheduled by the effect that runs on that flush.
    await act(() => vi.advanceTimersByTimeAsync(1500))
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS))

    const bodies = patchesTo(2)
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) {
      expect(body.general).toBe('einar')
      expect(body.title).toBe('Card B')
      expect(body.theme_primary_hex).toBeUndefined()
    }
    expect(patchesTo(1)).toEqual([])
    expect(screen.getByPlaceholderText<HTMLInputElement>('Untitled Card').value).toBe('Card B')
  })
})

describe('guest editor', () => {
  it('still restores the locally saved card', async () => {
    auth.isAuthenticated = false
    rememberLastEditedCard({ id: undefined, title: 'My guest card' })

    renderEditor('/editor')
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS))

    expect(screen.getByPlaceholderText<HTMLInputElement>('Untitled Card').value).toBe('My guest card')
    expect(patchCard).not.toHaveBeenCalled()
  })
})
