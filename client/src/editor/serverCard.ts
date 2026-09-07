import { ServerCard, fetchImageBlob } from '../lib/api'
import type { CustomTheme } from './CustomThemePanel'
import { CardState, DEFAULT_CARD, HitboxState } from './types'

export const DEFAULT_CUSTOM_THEME: CustomTheme = { primary: '#3080ff', secondary: '#88aacc', background: '#556677' }

/** Rebuilds hitbox state from its stored JSON, remapping server image ids onto the local layer ids. */
export function deserializeHitbox(json: string | null | undefined, images: { id: string; remoteId?: number }[]): HitboxState | undefined {
  if (!json) return undefined
  try {
    const parsed = JSON.parse(json)
    const remoteToLocal = new Map<number, string>()
    for (const img of images) {
      if (img.remoteId) remoteToLocal.set(img.remoteId, img.id)
    }
    return {
      silhouettes: (parsed.silhouettes || []).map((s: any) => ({ ...s, imageId: remoteToLocal.get(s.imageId) ?? s.imageId })),
      losMarkers: (parsed.losMarkers || []).map((m: any) => ({ ...m, imageId: remoteToLocal.get(m.imageId) ?? m.imageId })),
    }
  } catch {
    return undefined
  }
}

/**
 * Turns a full server card (with image URLs and powers) into editor state. Each image is fetched from
 * its short-lived URL and becomes an object URL — call `revokeCardImages` when the state is discarded.
 * A layer whose bytes can't be fetched keeps an empty dataUrl rather than failing the whole card.
 */
export async function serverCardToState(server: ServerCard): Promise<CardState> {
  const images = await Promise.all((server.images || []).map(async (im) => {
    let dataUrl = ''
    if (im.url) {
      try {
        const blob = await fetchImageBlob(im.url)
        if (blob) dataUrl = URL.createObjectURL(blob)
        else console.warn('Image layer unavailable', im.id)
      } catch (e) {
        console.warn('Image layer fetch failed', im.id, e)
      }
    }
    return { id: crypto.randomUUID(), name: im.name || undefined, dataUrl, x: im.x, y: im.y, scale: im.scale, rotation: im.rotation ?? null, order: im.order, remoteId: im.id }
  }))

  // Always provide 4 power rows (orders 0..3), filling gaps with empty rows.
  const serverPowers = (server.powers || []).map((p) => ({ id: String(p.id), order: p.order, heading: p.heading, body: p.body, remoteId: p.id } as any))
  const powers = [0, 1, 2, 3].map((ord) => {
    const fromServer: any = serverPowers.find((p: any) => p.order === ord)
    if (fromServer) return fromServer
    return { id: crypto.randomUUID(), order: ord, heading: '', body: '' } as any
  })

  const str = (sv: string | null | undefined) => sv ?? ''
  const hitbox = deserializeHitbox(server.hitbox_json, images)
  return {
    ...DEFAULT_CARD,
    id: server.id,
    title: server.title || 'Untitled Card',
    general: (server.general as any) || 'vydar',
    fields: {
      cardName: str(server.card_name),
      tribeName: str(server.tribe_name),
      species: str(server.species),
      uniqueness: str(server.uniqueness),
      class: str(server.class),
      personality: str(server.personality),
      size: str(server.size),
      life: str(server.life),
      move: str(server.move),
      range: str(server.range),
      attack: str(server.attack),
      defense: str(server.defense),
      points: str(server.points),
    },
    powers,
    images,
    ...(hitbox ? { hitbox } : {}),
  }
}

/** The custom theme saved with a card, or null when the card isn't custom / colours are incomplete. */
export function customThemeFromServer(server: ServerCard): CustomTheme | null {
  if (server.general !== 'custom') return null
  const { theme_primary_hex: primary, theme_secondary_hex: secondary, theme_background_hex: background } = server
  if (primary && secondary && background) return { primary, secondary, background }
  return null
}

/** Frees the object URLs created by `serverCardToState`. */
export function revokeCardImages(card: CardState) {
  for (const img of card.images) {
    if (img.dataUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(img.dataUrl)
      } catch {}
    }
  }
}
