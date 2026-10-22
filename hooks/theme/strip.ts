import type { SessionState } from '../../types'

export const GAP = 4
const DOT = 8
const SWEEP = '2.4s'

const LIGHT = '--track:rgba(31,30,29,0.10);--grey:#87867F;--amber:#B7791F;--green:#3F7A35;--red:#C2413B'
const DARK = '--track:rgba(250,249,245,0.12);--grey:#9C9A92;--amber:#E8B04B;--green:#7BC46A;--red:#F06A60'

const TONE: Record<SessionState, 'red' | 'amber' | 'green' | 'grey'> = { 'needs-you': 'red', waiting: 'amber', working: 'green', done: 'grey' }

export type Segment = { state: SessionState; fill: number }

const pill = (start: number, width: number) => {
  const length = Math.max(width, DOT)
  return `M${(start + 4).toFixed(1)},1h${(length - 8).toFixed(1)}a4,4 0 0 1 0,8h${(8 - length).toFixed(1)}a4,4 0 0 1 0,-8Z`
}

export const dotsWidth = (count: number) => count * DOT + (count - 1) * GAP

export function strip(width: number, segments: readonly Segment[], look: 'live' | 'dim' | 'done' = 'live') {
  const slot = (width - GAP * (segments.length - 1)) / segments.length
  const fills = { grey: '', amber: '', green: '', red: '' }
  let track = ''
  let shine = ''
  segments.forEach((segment, index) => {
    const start = index * (slot + GAP)
    const filled = slot * Math.min(1, Math.max(0, segment.fill))
    track += pill(start, slot)
    fills[look === 'done' ? 'green' : TONE[segment.state]] += pill(start, filled)
    if (look !== 'live' || segment.state !== 'working' || filled < DOT) return
    const glow = Math.max(DOT, filled * 0.3)
    shine +=
      `<clipPath id="f${index}"><path d="${pill(start, filled)}"/></clipPath><g clip-path="url(#f${index})" style="fill:#FFFFFF;opacity:.45">` +
      `<path class="m" d="${pill(0, glow)}"><animateTransform attributeName="transform" type="translate" from="${(start - glow).toFixed(1)} 0" to="${(start + filled).toFixed(1)} 0" dur="${SWEEP}" repeatCount="indefinite"/></path>` +
      `<path class="s" d="${pill(start + filled * 0.35, glow)}"/></g>`
  })
  const red = fills.red
    ? `<path class="m" d="${fills.red}" style="fill:var(--red)"><animate attributeName="opacity" values="1;.4;1" dur="${SWEEP}" repeatCount="indefinite"/></path><path class="s" d="${fills.red}" style="fill:var(--red)"/>`
    : ''
  const body =
    `<path d="${track}" style="fill:var(--track)"/>` +
    (['grey', 'amber', 'green'] as const).map(tone => (fills[tone] ? `<path d="${fills[tone]}" style="fill:var(--${tone})"/>` : '')).join('') +
    red +
    shine
  const room = Math.round(width)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${room}" height="10" viewBox="0 0 ${room} 10" preserveAspectRatio="none"><style>svg{${LIGHT}}@media (prefers-color-scheme: dark){svg{${DARK}}}.s{display:none}@media (prefers-reduced-motion: reduce){.m{display:none}.s{display:inline}}</style>${look === 'dim' ? `<g opacity=".35">${body}</g>` : body}</svg>`
}
