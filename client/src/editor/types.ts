export type General = 'aquilla' | 'einar' | 'jandar' | 'ullar' | 'utgar' | 'valkrill' | 'vydar' | 'custom'

export type Power = { id: string; order: number; heading: string; body: string }
// For server persistence
export type RemotePower = Power & { remoteId?: number }

export type ImageLayer = {
  id: string
  name?: string
  dataUrl: string
  x: number
  y: number
  scale: number
  rotation?: number | null
  order: number
  remoteId?: number
}

export type CardState = {
  id?: number
  title: string
  general: General
  fields: {
    cardName: string
    tribeName: string
    species: string
    uniqueness: string
    class: string
    personality: string
    size: string
    life: string
    move: string
    range: string
    attack: string
    defense: string
    points: string
  }
  powers: Power[]
  images: ImageLayer[]
}

export const DEFAULT_CARD: CardState = {
  title: 'Untitled Card',
  general: 'vydar',
  fields: {
    cardName: 'Freeze Man',
    tribeName: 'Earth',
    species: 'human',
    uniqueness: 'unique hero',
    class: 'agent',
    personality: 'tricky',
    size: 'medium 5',
    life: '4',
    move: '5',
    range: '3',
    attack: '3',
    defense: '4',
    points: '100',
  },
  powers: [
    { id: 'p1', order: 0, heading: 'Icy Helmet', body: '' },
    { id: 'p2', order: 1, heading: 'Freeze Ray', body: '' },
    { id: 'p3', order: 2, heading: 'Ice Cold', body: '' },
    { id: 'p4', order: 3, heading: '', body: '' },
  ],
  images: [],
}
