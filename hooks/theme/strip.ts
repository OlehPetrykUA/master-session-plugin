export const GAP = 4
export const CHILD_GAP = 2
export const SUBAGENT = 12
export const SEGMENT = 24
const SWEEP = '2.4s'
const DOT: Record<StripKind, number> = { session: 8, subagent: 6, workflow: 8 }

const LIGHT = '--track:rgba(31,30,29,0.10);--grey:#87867F;--amber:#B7791F;--green:#3F7A35;--red:#C2413B'
const DARK = '--track:rgba(250,249,245,0.12);--grey:#9C9A92;--amber:#E8B04B;--green:#7BC46A;--red:#F06A60'

export type StripKind = 'session' | 'subagent' | 'workflow'

export type StripTone = 'grey' | 'amber' | 'green' | 'red' | 'failed'

export type StripItem = { kind: StripKind; tone: StripTone; fill: number; pieces?: number; isChild?: boolean; isWorking?: boolean }

const FILL: Record<StripTone, string> = { grey: 'grey', amber: 'amber', green: 'green', red: 'red', failed: 'red' }

const n = (value: number) => value.toFixed(1)

const capsule = (x: number, y: number, width: number, height: number) => {
  const radius = height / 2
  const length = Math.max(width, height)
  return `M${n(x + radius)},${y}h${n(length - height)}a${radius},${radius} 0 0 1 0,${height}h${n(height - length)}a${radius},${radius} 0 0 1 0,-${height}Z`
}

const block = (x: number, y: number, width: number, height: number, corner = 2) => {
  const radius = Math.min(corner, width / 2)
  return `M${n(x + radius)},${y}h${n(width - 2 * radius)}a${radius},${radius} 0 0 1 ${radius},${radius}v${height - 2 * radius}a${radius},${radius} 0 0 1 -${radius},${radius}h${n(2 * radius - width)}a${radius},${radius} 0 0 1 -${radius},-${radius}v${2 * radius - height}a${radius},${radius} 0 0 1 ${radius},-${radius}Z`
}

const circle = (cx: number, radius: number) => `M${n(cx)},5m-${radius},0a${radius},${radius} 0 1 0 ${2 * radius},0a${radius},${radius} 0 1 0 -${2 * radius},0Z`

const gapBefore = (item: StripItem, index: number) => (index ? (item.isChild ? CHILD_GAP : GAP) : 0)

const gapsOf = (items: readonly StripItem[]) => items.reduce((sum, item, index) => sum + gapBefore(item, index), 0)

const fixedOf = (items: readonly StripItem[]) => items.filter(item => item.kind === 'subagent').length * SUBAGENT

const flexOf = (items: readonly StripItem[]) => items.filter(item => item.kind !== 'subagent').length

export const flexCount = flexOf

export const barsWidth = (items: readonly StripItem[]) => fixedOf(items) + gapsOf(items) + flexOf(items) * SEGMENT

export const dotsWidth = (items: readonly StripItem[]) => items.reduce((sum, item) => sum + DOT[item.kind], 0) + gapsOf(items)

type Paint = { track: string; fills: Record<string, string>; alert: string; shine: string }

function bars(width: number, items: readonly StripItem[], look: 'live' | 'dim' | 'done', paint: Paint) {
  const flex = flexOf(items)
  const slot = flex ? Math.max(0, (width - fixedOf(items) - gapsOf(items)) / flex) : 0
  let x = 0
  items.forEach((item, index) => {
    x += gapBefore(item, index)
    const tone = look === 'done' ? 'green' : FILL[item.tone]
    const target = item.tone === 'red' && look !== 'done' ? 'alert' : tone
    const add = (path: string) => (target === 'alert' ? (paint.alert += path) : (paint.fills[tone] = (paint.fills[tone] ?? '') + path))
    if (item.kind === 'subagent') {
      add(capsule(x, 2, SUBAGENT, 6))
      x += SUBAGENT
      return
    }
    if (item.kind === 'session') {
      const filled = slot * Math.min(1, Math.max(0, item.fill))
      paint.track += capsule(x, 0, slot, 10)
      if (filled > 0) add(capsule(x, 0, filled, 10))
      if (look === 'live' && item.isWorking && filled >= 10) {
        const glow = Math.max(10, filled * 0.3)
        const clip = `s${index}`
        paint.shine +=
          `<clipPath id="${clip}"><path d="${capsule(x, 0, filled, 10)}"/></clipPath><g clip-path="url(#${clip})" style="fill:#FFFFFF;opacity:.45">` +
          `<path class="m" d="${capsule(0, 0, glow, 10)}"><animateTransform attributeName="transform" type="translate" from="${n(x - glow)} 0" to="${n(x + filled)} 0" dur="${SWEEP}" repeatCount="indefinite"/></path>` +
          `<path class="s" d="${capsule(x + filled * 0.35, 0, glow, 10)}"/></g>`
      }
      x += slot
      return
    }
    const count = Math.max(1, item.pieces ?? 1)
    const piece = (slot - CHILD_GAP * (count - 1)) / count
    const reached = Math.min(1, Math.max(0, item.fill)) * count
    for (let at = 0; at < count; at += 1) {
      const start = x + at * (piece + CHILD_GAP)
      paint.track += block(start, 0, piece, 10)
      const share = Math.min(1, Math.max(0, reached - at))
      if (!share) continue
      const isPast = share === 1 && at < Math.ceil(reached) - 1
      const path = block(start, 0, piece * share, 10)
      if (isPast && look !== 'done') paint.fills.grey = (paint.fills.grey ?? '') + path
      else add(path)
    }
    x += slot
  })
}

function dots(items: readonly StripItem[], look: 'live' | 'dim' | 'done', paint: Paint) {
  let x = 0
  items.forEach((item, index) => {
    x += gapBefore(item, index)
    const size = DOT[item.kind]
    const tone = look === 'done' ? 'green' : FILL[item.tone]
    const path = item.kind === 'workflow' ? `M${n(x + 2)},1h4a2,2 0 0 1 2,2v4a2,2 0 0 1 -2,2h-4a2,2 0 0 1 -2,-2v-4a2,2 0 0 1 2,-2Z` : circle(x + size / 2, size / 2)
    if (item.tone === 'red' && look !== 'done') paint.alert += path
    else paint.fills[tone] = (paint.fills[tone] ?? '') + path
    x += size
  })
}

export function strip(width: number, items: readonly StripItem[], look: 'live' | 'dim' | 'done' = 'live', isDots = false) {
  const paint: Paint = { track: '', fills: {}, alert: '', shine: '' }
  if (isDots) dots(items, look, paint)
  else bars(width, items, look, paint)
  const red = paint.alert
    ? `<path class="m" d="${paint.alert}" style="fill:var(--red)"><animate attributeName="opacity" values="1;.4;1" dur="${SWEEP}" repeatCount="indefinite"/></path><path class="s" d="${paint.alert}" style="fill:var(--red)"/>`
    : ''
  const body =
    (paint.track ? `<path d="${paint.track}" style="fill:var(--track)"/>` : '') +
    (['grey', 'amber', 'green', 'red'] as const).map(tone => (paint.fills[tone] ? `<path d="${paint.fills[tone]}" style="fill:var(--${tone})"/>` : '')).join('') +
    red +
    paint.shine
  const room = Math.round(width)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${room}" height="10" viewBox="0 0 ${room} 10" preserveAspectRatio="none"><style>svg{${LIGHT}}@media (prefers-color-scheme: dark){svg{${DARK}}}.s{display:none}@media (prefers-reduced-motion: reduce){.m{display:none}.s{display:inline}}</style>${look === 'dim' ? `<g opacity=".35">${body}</g>` : body}</svg>`
}
