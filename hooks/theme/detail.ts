import type { Tone } from './tokens'

const LIGHT = '--text:#141413;--muted:#5E5D59;--faint:#87867F;--red:#C2413B;--amber:#B7791F;--green:#3F7A35;--grey:#87867F;--accentText:#9A4429;--onAccent:#FFFFFF;--track:rgba(31,30,29,0.10)'
const DARK = '--text:#FAF9F5;--muted:#B0AEA5;--faint:#9C9A92;--red:#F06A60;--amber:#E8B04B;--green:#7BC46A;--grey:#9C9A92;--accentText:#F0A58A;--onAccent:#141413;--track:rgba(250,249,245,0.12)'
const SWEEP = '2.4s'

const frame = (width: number, height: number, body: string, box = `0 0 ${width} ${height}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${box}" preserveAspectRatio="none"><style>svg{${LIGHT}}@media (prefers-color-scheme: dark){svg{${DARK}}}.s{display:none}@media (prefers-reduced-motion: reduce){.m{display:none}.s{display:inline}}</style>${body}</svg>`

export type PhaseShare = { done: number; running: number; failed: number; total: number; isFinished: boolean }

const pill = (start: number, width: number) => {
  const length = Math.max(width, 8)
  return `M${(start + 4).toFixed(1)},1h${(length - 8).toFixed(1)}a4,4 0 0 1 0,8h${(8 - length).toFixed(1)}a4,4 0 0 1 0,-8Z`
}

export function phaseStrip(width: number, phases: readonly PhaseShare[]) {
  const slot = (width - 4 * (phases.length - 1)) / phases.length
  let track = ''
  let grey = ''
  let green = ''
  let red = ''
  let shine = ''
  phases.forEach((phase, index) => {
    const start = index * (slot + 4)
    track += pill(start, slot)
    if (phase.isFinished && !phase.failed) {
      grey += pill(start, slot)
      return
    }
    const share = (count: number) => (phase.total ? (slot * count) / phase.total : 0)
    const good = share(phase.done + phase.running / 2)
    const bad = share(phase.failed)
    if (good >= 1) green += pill(start, good)
    if (bad >= 1) red += pill(start + good + (good >= 1 ? 2 : 0), bad - (good >= 1 ? 2 : 0))
    if (!phase.running || good < 8) return
    const glow = Math.max(8, good * 0.3)
    shine +=
      `<clipPath id="w${index}"><path d="${pill(start, good)}"/></clipPath><g clip-path="url(#w${index})" style="fill:#FFFFFF;opacity:.45">` +
      `<path class="m" d="${pill(0, glow)}"><animateTransform attributeName="transform" type="translate" from="${(start - glow).toFixed(1)} 0" to="${(start + good).toFixed(1)} 0" dur="${SWEEP}" repeatCount="indefinite"/></path>` +
      `<path class="s" d="${pill(start + good * 0.35, glow)}"/></g>`
  })
  const fill = (path: string, tone: Tone | 'track') => (path ? `<path d="${path}" style="fill:var(--${tone})"/>` : '')
  const room = Math.round(width)
  return frame(room, 10, fill(track, 'track') + fill(grey, 'grey') + fill(green, 'green') + fill(red, 'red') + shine)
}

