import type { SessionState } from '../../types'

import { escape, textWidth } from '../lib/layout'
import type { Tone } from './tokens'

const LIGHT =
  '--text:#141413;--muted:#5E5D59;--faint:#87867F;--accentBtn:#B85335;--onAccent:#FFFFFF;--accentText:#9A4429;--red:#C2413B;--redTint:rgba(194,65,59,0.10);--amber:#B7791F;--amberTint:rgba(183,121,31,0.12);--green:#3F7A35;--greenTint:rgba(63,122,53,0.12);--grey:#87867F;--greyTint:rgba(135,134,127,0.14);--track:rgba(31,30,29,0.10);--surface2:#F5F4ED;--redT:rgba(194,65,59,.10);--amberT:rgba(183,121,31,.12);--greenT:rgba(63,122,53,.12);--greyT:rgba(135,134,127,.14)'
const DARK =
  '--text:#FAF9F5;--muted:#B0AEA5;--faint:#9C9A92;--accentBtn:#D97757;--onAccent:#141413;--accentText:#F0A58A;--red:#F06A60;--redTint:rgba(240,106,96,0.14);--amber:#E8B04B;--amberTint:rgba(232,176,75,0.14);--green:#7BC46A;--greenTint:rgba(123,196,106,0.14);--grey:#9C9A92;--greyTint:rgba(156,154,146,0.16);--track:rgba(250,249,245,0.12);--surface2:#30302E;--redT:rgba(240,106,96,.14);--amberT:rgba(232,176,75,.14);--greenT:rgba(123,196,106,.14);--greyT:rgba(156,154,146,.16)'
const FONT = "'Anthropic Sans',system-ui,-apple-system,BlinkMacSystemFont,sans-serif"
const MOTION =
  '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes tw{0%,100%{opacity:1}50%{opacity:.3}}@keyframes glow{0%,100%{opacity:1}50%{opacity:.8}}' +
  '.p{animation:pulse 1.8s ease-in-out infinite}.t0,.t1,.t2,.t3{animation:tw 2.2s ease-in-out infinite}.t1{animation-duration:2.8s;animation-delay:-.7s}.t2{animation-duration:1.9s;animation-delay:-1.3s}.t3{animation-duration:3.3s;animation-delay:-.4s}' +
  '@media (prefers-reduced-motion: reduce){.p,.t0,.t1,.t2,.t3{animation:none}}'

export const I = {
  needs: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M12 7.5v5.5 M12 16.4v.1',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M12 7.5V12l3 2',
  working: 'M3 12h4l3-7 4 14 3-7h4',
  done: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M8 12.5l2.7 2.7L16 9.5',
  house: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-5h4v5',
  branch: 'M6 3v12 M18 9a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z M6 21a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z M18 9a9 9 0 0 1-9 9',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  collapse: 'M6 15l6-6 6 6',
  showAll: 'M7 7l5 5 5-5 M7 13l5 5 5-5',
  open: 'M7 17L17 7 M8 7h9v9',
  archive: 'M3 4h18v4H3Z M5 8v12h14V8 M10 12h4',
  unarchive: 'M3 4h18v4H3Z M5 8v12h14V8 M12 17v-6 M9.5 13.5L12 11l2.5 2.5',
  chat: 'M4 5h16v11H9l-5 4Z',
  panel: 'M4 4h16v16H4Z M15 4v16',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  all: 'M4 4h7v7H4Z M13 4h7v7h-7Z M4 13h7v7H4Z M13 13h7v7h-7Z',
  folder: 'M3 6h6l2 2h10v11H3Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  blocker: 'M12 4l9 16H3Z M12 10v4.5 M12 17.4v.1',
  now: 'M8 5l11 7-11 7Z',
  next: 'M5 12h14 M13 6l6 6-6 6',
  git: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6Z M3 12h6 M15 12h6',
  tests: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3',
  files: 'M6 3h8l4 4v14H6Z M14 3v4h4',
  permission: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6Z',
  model: 'M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5Z',
  pulse: 'M3 12h4l3-7 4 14 3-7h4',
  session: 'M3 5h18v14H3Z M7 10l3 2-3 2 M12 14h5',
  agent: 'M6 8h12v11H6Z M12 4v4 M9.5 12.5v1 M14.5 12.5v1 M9.5 16h5',
  flow: 'M4 4h6v6H4Z M14 14h6v6h-6Z M7 10v4a3 3 0 0 0 3 3h4',
  expand: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12 M18 6L6 18',
} as const

export type IconName = keyof typeof I

const svg = (width: number, height: number, body: string, box = `0 0 ${width} ${height}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${box}"><style>svg{${LIGHT}}@media (prefers-color-scheme: dark){svg{${DARK}}}text{font-family:${FONT};font-variant-numeric:tabular-nums}${MOTION}</style>${body}</svg>`

const stroke = (path: string, tone: Tone, weight: number) =>
  `<path d="${path}" style="fill:none;stroke:var(--${tone});stroke-width:${weight};stroke-linecap:round;stroke-linejoin:round"/>`

export const glyph = (name: IconName, size: number, tone: Tone, weight = 1.75) => svg(size, size, stroke(I[name], tone, weight), '0 0 24 24')

export const STATE: Record<SessionState, { icon: IconName; tone: Tone; tint: string; word: string }> = {
  'needs-you': { icon: 'needs', tone: 'red', tint: 'redTint', word: 'needs you' },
  waiting: { icon: 'clock', tone: 'amber', tint: 'amberTint', word: 'waiting' },
  working: { icon: 'working', tone: 'green', tint: 'greenTint', word: 'working' },
  done: { icon: 'done', tone: 'grey', tint: 'greyTint', word: 'done' },
}

export function badge(state: SessionState, size = 32, radius = 10, iconSize = 18) {
  const one = STATE[state]
  const at = (size - iconSize) / 2
  return svg(
    size,
    size,
    `<rect width="${size}" height="${size}" rx="${radius}" style="fill:var(--${one.tint})"/><g${state === 'needs-you' ? ' class="p"' : ''} transform="translate(${at} ${at}) scale(${iconSize / 24})">${stroke(I[one.icon], one.tone, 1.75)}</g>`,
  )
}

export function square(name: IconName, tone: Tone, tint: string, size: number, radius: number, iconSize: number, weight = 2.2) {
  const at = (size - iconSize) / 2
  return svg(size, size, `<rect width="${size}" height="${size}" rx="${radius}" style="fill:var(--${tint})"/><g transform="translate(${at} ${at}) scale(${iconSize / 24})">${stroke(I[name], tone, weight)}</g>`)
}

const RING = 2 * Math.PI * 14

export function ring(done: number, total: number, state: SessionState) {
  const share = total ? Math.min(done / total, 1) : 0
  const tone = STATE[state].tone
  return svg(
    34,
    34,
    `<circle cx="17" cy="17" r="14" style="fill:none;stroke:var(--track);stroke-width:3"/>${share ? `<circle cx="17" cy="17" r="14" transform="rotate(-90 17 17)" style="fill:none;stroke:var(--${tone});stroke-width:3;stroke-linecap:round;stroke-dasharray:${(RING * share).toFixed(1)} ${RING.toFixed(1)}"/>` : ''}<text x="17" y="21" text-anchor="middle" style="fill:var(--text);font-size:11px;font-weight:600">${total ? `${done}/${total}` : '–'}</text>`,
  )
}

export const dot = (tone: Tone, size = 7) => svg(size, size, `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" style="fill:var(--${tone})"/>`)

export const liveDot = (tone: Tone) =>
  svg(14, 14, `<circle cx="7" cy="7" r="7" style="fill:var(--${tone === 'green' ? 'greenTint' : 'amberTint'})"/><circle cx="7" cy="7" r="4" style="fill:var(--${tone})"/>`)

export function gitPill(count: number) {
  const label = String(count)
  const width = Math.ceil(6 + 6 + 4 + label.length * 6.6 + 6)
  return {
    source: svg(width, 16, `<rect width="${width}" height="16" rx="8" style="fill:var(--surface2)"/><circle cx="9" cy="8" r="3" style="fill:var(--text)"/><text x="16" y="12" style="fill:var(--text);font-size:11px;font-weight:600">${escape(label)}</text>`),
    width,
  }
}

export function numeral(value: string, tone: Tone) {
  const width = Math.ceil(textWidth(value, 18) * 1.25) + 4
  return { source: svg(width, 24, `<text x="0" y="18" style="fill:var(--${tone});font-size:18px;font-weight:600">${escape(value)}</text>`), width }
}
