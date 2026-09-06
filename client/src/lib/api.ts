import { CardState, ImageLayer } from '../editor/types'

const API_BASE = '/api'

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

export type ServerCard = {
  id: number
  user_id: number
  folder_id?: number | null
  title: string
  general: string
  card_name?: string | null
  tribe_name?: string | null
  species?: string | null
  uniqueness?: string | null
  class?: string | null
  personality?: string | null
  size?: string | null
  life?: string | null
  move?: string | null
  range?: string | null
  attack?: string | null
  defense?: string | null
  points?: string | null
  hitbox_json?: string | null
  theme_primary_hex?: string | null
  theme_secondary_hex?: string | null
  theme_background_hex?: string | null
  created_at: string
  updated_at: string
  /** Present (with its version stamp) when the editor has uploaded a rendered preview. */
  thumbnail?: { updated_at: string } | null
  powers?: { id: number; order: number; heading: string; body: string }[]
  images?: { id: number; order: number; x: number; y: number; scale: number; rotation?: number | null; name?: string | null; blob?: { type: 'Buffer'; data: number[] } }[]
}

export async function listCards(token?: string | null) {
  return api<ServerCard[]>('/cards', {}, token)
}

export async function createCard(input: Partial<ServerCard>, token?: string | null) {
  return api<ServerCard>('/cards', { method: 'POST', body: JSON.stringify(input) }, token)
}

export async function getCard(id: number, token?: string | null) {
  return api<ServerCard>('/cards/' + id, {}, token)
}

export async function patchCard(id: number, input: Partial<ServerCard>, token?: string | null) {
  return api<ServerCard>('/cards/' + id, { method: 'PATCH', body: JSON.stringify(input) }, token)
}

export async function deleteCard(id: number, token?: string | null) {
  return api<void>('/cards/' + id, { method: 'DELETE' }, token)
}

// Current user + preferences
export type ServerUser = {
  id: number
  email: string | null
  name: string | null
  avatar_url: string | null
  preferences: Record<string, unknown>
}

export async function getMe(token?: string | null) {
  return api<ServerUser>('/me', {}, token)
}

/** Shallow-merges keys into the stored preferences; a null value removes the key. */
export async function patchMe(preferences: Record<string, unknown>, token?: string | null) {
  return api<ServerUser>('/me', { method: 'PATCH', body: JSON.stringify({ preferences }) }, token)
}

// Thumbnails API
export async function putThumbnail(cardId: number, dataUrl: string, token?: string | null) {
  return api<{ updated_at: string }>(`/cards/${cardId}/thumbnail`, { method: 'PUT', body: JSON.stringify({ dataUrl }) }, token)
}

/** Fetches the thumbnail bytes (needs the bearer token, so it can't be a plain <img src>). */
export async function fetchThumbnailBlob(cardId: number, version: string, token?: string | null): Promise<Blob | null> {
  const res = await fetch(`${API_BASE}/cards/${cardId}/thumbnail?v=${encodeURIComponent(version)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return null
  return res.blob()
}

// Folders API
// Folders form a tree through parent_id (null = root). The server returns the flat list.
export type ServerFolder = {
  id: number
  user_id: number
  parent_id: number | null
  name: string
  created_at: string
  updated_at: string
}

export async function listFolders(token?: string | null) {
  return api<ServerFolder[]>('/folders', {}, token)
}

export async function createFolder(input: { name: string; parent_id: number | null }, token?: string | null) {
  return api<ServerFolder>('/folders', { method: 'POST', body: JSON.stringify(input) }, token)
}

export async function patchFolder(id: number, input: Partial<{ name: string; parent_id: number | null }>, token?: string | null) {
  return api<ServerFolder>('/folders/' + id, { method: 'PATCH', body: JSON.stringify(input) }, token)
}

export async function deleteFolder(id: number, token?: string | null) {
  return api<void>('/folders/' + id, { method: 'DELETE' }, token)
}

/** Move any mix of cards and folders into target folder (null = root) in one atomic request. */
export async function moveItems(
  input: { card_ids: number[]; folder_ids: number[]; target_folder_id: number | null },
  token?: string | null,
) {
  return api<{ ok: true; moved: { cards: number; folders: number } }>('/move', { method: 'POST', body: JSON.stringify(input) }, token)
}

export async function postImage(cardId: number, layer: ImageLayer, token?: string | null) {
  return api<any>(`/cards/${cardId}/images`, {
    method: 'POST',
    body: JSON.stringify({ name: layer.name, dataUrl: layer.dataUrl, x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation }),
  }, token)
}

export async function patchImage(cardId: number, imageId: number, patch: Partial<{ x: number; y: number; scale: number; rotation: number | null; order: number; name: string }>, token?: string | null) {
  return api<any>(`/cards/${cardId}/images/${imageId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }, token)
}

export async function deleteImageApi(cardId: number, imageId: number, token?: string | null) {
  return api<void>(`/cards/${cardId}/images/${imageId}`, { method: 'DELETE' }, token)
}

export async function postPower(cardId: number, power: { order: number; heading: string; body: string }, token?: string | null) {
  return api<{ id: number; order: number; heading: string; body: string }>(`/cards/${cardId}/powers`, {
    method: 'POST',
    body: JSON.stringify(power),
  }, token)
}

export async function patchPower(cardId: number, powerId: number, power: Partial<{ order: number; heading: string; body: string }>, token?: string | null) {
  return api<{ id: number; order: number; heading: string; body: string }>(`/cards/${cardId}/powers/${powerId}`, {
    method: 'PATCH',
    body: JSON.stringify(power),
  }, token)
}

export async function deletePower(cardId: number, powerId: number, token?: string | null) {
  return api<void>(`/cards/${cardId}/powers/${powerId}`, { method: 'DELETE' }, token)
}

// Theme library API
export type ServerTheme = { id: number; name: string; primary_hex: string; secondary_hex: string; background_hex: string; created_at: string }

export async function listThemes(token?: string | null) {
  return api<ServerTheme[]>(`/themes`, {}, token)
}

export async function createTheme(input: { name: string; primary_hex: string; secondary_hex: string; background_hex: string }, token?: string | null) {
  return api<ServerTheme>(`/themes`, { method: 'POST', body: JSON.stringify(input) }, token)
}

export async function patchTheme(id: number, input: Partial<{ name: string; primary_hex: string; secondary_hex: string; background_hex: string }>, token?: string | null) {
  return api<ServerTheme>(`/themes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token)
}

export async function deleteTheme(id: number, token?: string | null) {
  return api<void>(`/themes/${id}`, { method: 'DELETE' }, token)
}
