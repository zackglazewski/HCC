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
  created_at: string
  updated_at: string
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
