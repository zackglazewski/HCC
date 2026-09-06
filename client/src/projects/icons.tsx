import { SVGProps } from 'react'
import { EMBLEM_PATHS } from '../editor/emblems'
import { General } from '../editor/types'

type IconProps = SVGProps<SVGSVGElement> & { className?: string }

function Stroke({ className = 'w-4 h-4', children, ...rest }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

/** Solid folder glyph. Colored via `text-*` classes. */
export function FolderIcon({ className = 'w-5 h-5', ...rest }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.66 0 1.29.26 1.76.73l1.14 1.14c.2.2.46.3.74.3H18.5A2.5 2.5 0 0 1 21 8.67V17.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z" />
      <path d="M3 9.5h18" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
    </svg>
  )
}

export function FolderOpenIcon({ className = 'w-5 h-5', ...rest }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.66 0 1.29.26 1.76.73l1.14 1.14c.2.2.46.3.74.3H18.5A2.5 2.5 0 0 1 21 8.67V10H5.2a2.5 2.5 0 0 0-2.2 1.3V6.5Z" opacity={0.65} />
      <path d="M5.2 11h15.05c1.02 0 1.75.98 1.45 1.95l-1.62 5.3A2.5 2.5 0 0 1 17.7 20H5.5A2.5 2.5 0 0 1 3 17.5v-4a2.5 2.5 0 0 1 2.2-2.5Z" />
    </svg>
  )
}

export function FolderPlusIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M12 11v6M9 14h6" />
    </Stroke>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 5v14M5 12h14" />
    </Stroke>
  )
}

export function GridIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </Stroke>
  )
}

export function ListIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={3} />
    </Stroke>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
    </Stroke>
  )
}

export function XIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Stroke>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" strokeWidth={2.5} />
    </Stroke>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m9 6 6 6-6 6" />
    </Stroke>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m6 9 6 6 6-6" />
    </Stroke>
  )
}

export function MoreIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.5} />
    </Stroke>
  )
}

export function PencilIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" />
      <path d="M17.6 3.6a2 2 0 1 1 2.8 2.8L11.8 15H9v-2.8l8.6-8.6Z" />
    </Stroke>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M19 7l-.9 12.1A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.9L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
    </Stroke>
  )
}

export function MoveIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M9 14h6m0 0-2.5-2.5M15 14l-2.5 2.5" />
    </Stroke>
  )
}

export function OpenIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </Stroke>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-9" />
    </Stroke>
  )
}

export function CardIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Stroke>
  )
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 19V5m0 0-6 6m6-6 6 6" />
    </Stroke>
  )
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 5v14m0 0 6-6m-6 6-6-6" />
    </Stroke>
  )
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
    </Stroke>
  )
}

export function SelectIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12 2.5 2.5L15.5 9.5" />
    </Stroke>
  )
}

export function ImageIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m20.5 15.5-4.3-4.3a1 1 0 0 0-1.4 0L8 18" />
    </Stroke>
  )
}

export function CrestIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 3 4.5 7v5c0 4.2 3.2 7.6 7.5 9 4.3-1.4 7.5-4.8 7.5-9V7L12 3Z" />
      <path d="M12 8v6M9 11h6" />
    </Stroke>
  )
}

/** The general's crest, drawn from the same vector paths the canvas uses. Renders nothing for "custom". */
export function Emblem({ general, className = 'w-12 h-12' }: { general: string | null | undefined; className?: string }) {
  const d = general ? EMBLEM_PATHS[general as General] : ''
  if (!d) return null
  return (
    <svg className={className} viewBox="0 0 1000 1000" aria-hidden="true">
      <path d={d} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}
