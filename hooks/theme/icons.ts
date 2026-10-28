import { escape, textWidth } from '../lib/layout'
import { C } from './tokens'
import type { Tone } from './tokens'

const LIGHT =
  '--text:#141413;--muted:#5E5D59;--faint:#87867F;--accentBtn:#B85335;--onAccent:#FFFFFF;--accentText:#9A4429;--red:#C2413B;--redTint:rgba(194,65,59,0.10);--amber:#B7791F;--amberTint:rgba(183,121,31,0.12);--green:#3F7A35;--greenTint:rgba(63,122,53,0.12);--grey:#87867F;--greyTint:rgba(135,134,127,0.14);--track:rgba(31,30,29,0.10);--surface2:#F5F4ED;--redT:rgba(194,65,59,.10);--amberT:rgba(183,121,31,.12);--greenT:rgba(63,122,53,.12);--greyT:rgba(135,134,127,.14);--accentBtnHover:#A64A2E;--accentTint:rgba(217,119,87,0.14);--accentTint2:rgba(217,119,87,0.22);--hoverBg:#F0EEE6'
const DARK =
  '--text:#FAF9F5;--muted:#B0AEA5;--faint:#9C9A92;--accentBtn:#D97757;--onAccent:#141413;--accentText:#F0A58A;--red:#F06A60;--redTint:rgba(240,106,96,0.14);--amber:#E8B04B;--amberTint:rgba(232,176,75,0.14);--green:#7BC46A;--greenTint:rgba(123,196,106,0.14);--grey:#9C9A92;--greyTint:rgba(156,154,146,0.16);--track:rgba(250,249,245,0.12);--surface2:#30302E;--redT:rgba(240,106,96,.14);--amberT:rgba(232,176,75,.14);--greenT:rgba(123,196,106,.14);--greyT:rgba(156,154,146,.16);--accentBtnHover:#E3896B;--accentTint:rgba(217,119,87,0.18);--accentTint2:rgba(217,119,87,0.26);--hoverBg:#30302E'
const FONT = "'Anthropic Sans',system-ui,-apple-system,BlinkMacSystemFont,sans-serif"

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
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
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
  pulse: 'M3 12h4l3-7 4 14 3-7h4',
  idle: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M10 9v6 M14 9v6',
  ready: 'M5 21V4 M5 4h12l-2.5 4L17 12H5',
  verified: 'M2 12.5l4.5 4.5L15.5 8 M10 15.5l1.5 1.5L21 8',
  merged: 'M6 4a2 2 0 1 0 0 4a2 2 0 0 0 0-4Z M6 8v12 M6 9c0 4 3.5 6 9 6 M18 13a2 2 0 1 0 0 4a2 2 0 0 0 0-4Z',
  failed: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M9 9l6 6 M15 9l-6 6',
  queued: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M8 12h.01 M12 12h.01 M16 12h.01',
  unmerged: 'M6 4a2 2 0 1 0 0 4a2 2 0 0 0 0-4Z M6 8v12 M18 16a2 2 0 1 0 0 4a2 2 0 0 0 0-4Z M18 16V9a3 3 0 0 0-3-3h-4 M13 4l-2 2 2 2',
  elapsed: 'M12 8a7 7 0 1 0 0 14a7 7 0 0 0 0-14Z M12 11.5V15 M10 2h4 M12 2v3 M18.5 6.5l1.5-1.5',
  usage: 'M5 20v-8 M10 20V6 M15 20v-9 M20 20v-4',
  offline: 'M3 3l18 18 M8.6 8.6A8 8 0 0 0 5 11 M12.5 5a12 12 0 0 1 7.5 3 M8.5 14.5a5 5 0 0 1 6.2-.5 M12 18.5h.01',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M12 11v5 M12 7.6v.1',
  stop: 'M7 7h10v10H7Z',
  pause: 'M8.5 5v14 M15.5 5v14',
  undo: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  opus: 'M7 4h10l4 5-9 11L3 9Z M3 9h18 M9.5 9L12 20l2.5-11',
  sonnet: 'M19 5C11 5 6 10 5 19 M5 19c8-1 13-6 14-14 M9 15h5 M12 11h4',
  haiku: 'M5 7h9 M5 12h14 M5 17h9',
  fable: 'M3 6c3-1.5 6-1.5 9 0v13c-3-1.5-6-1.5-9 0Z M12 6c3-1.5 6-1.5 9 0v13c-3-1.5-6-1.5-9 0Z',
  modelChip: 'M7 7h10v10H7Z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4',
  implementer: 'M14.5 4.5a4.5 4.5 0 0 0-4.2 6.1L4 16.9V20h3.1l6.3-6.3a4.5 4.5 0 0 0 6.1-4.2l-2.8 2.8-2.6-.5-.5-2.6Z',
  refactorer: 'M4 8h13 M14 5l3 3-3 3 M20 16H7 M10 13l-3 3 3 3',
  reviewer: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13Z M20 20l-4.8-4.8 M7.8 10.6l1.9 1.9 3.6-3.6',
  verifier: 'M9 3h6v4H9Z M9 5H6v16h12V5h-3 M9 13.5l2 2 4-4',
  designChecker: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6Z',
  researcher: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5Z M5 19.5A1.5 1.5 0 0 0 6.5 21H19 M9 7h6',
  designer: 'M15 4l5 5L9 20H4v-5Z M13 6l5 5',
  architect: 'M12 3l9 4.5-9 4.5-9-4.5Z M3 12l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5',
  validator: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5Z',
  session: 'M3 5h18v14H3Z M7 10l3 2-3 2 M12 14h5',
  agent: 'M6 8h12v11H6Z M12 4v4 M9.5 12.5v1 M14.5 12.5v1 M9.5 16h5',
  flow: 'M4 4h6v6H4Z M14 14h6v6h-6Z M7 10v4a3 3 0 0 0 3 3h4',
  expand: 'M6 9l6 6 6-6',
  fail: 'M6 6l12 12 M18 6L6 18',
} as const

export type IconName = keyof typeof I

export const PERSONA_GLYPH: Record<string, IconName> = {
  Implementer: 'implementer',
  Refactorer: 'refactorer',
  Reviewer: 'reviewer',
  'Code reviewer': 'reviewer',
  'QA verifier': 'verifier',
  'Design checker': 'designChecker',
  Researcher: 'researcher',
  Designer: 'designer',
  Architect: 'architect',
  Validator: 'validator',
}

const usedOf = (vars: string, body: string) =>
  vars
    .split(';')
    .filter(pair => body.includes(`var(${pair.slice(0, pair.indexOf(':'))})`))
    .join(';')

function svg(width: number, height: number, body: string, box = `0 0 ${width} ${height}`) {
  const light = usedOf(LIGHT, body)
  const theme = light ? `svg{${light}}@media (prefers-color-scheme: dark){svg{${usedOf(DARK, body)}}}` : ''
  const text = body.includes('<text') ? `text{font-family:${FONT};font-variant-numeric:tabular-nums}` : ''
  const style = theme + text
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${box}">${style ? `<style>${style}</style>` : ''}${body}</svg>`
}

const stroke = (path: string, tone: Tone, weight: number) =>
  `<path d="${path}" style="fill:none;stroke:var(--${tone});stroke-width:${weight};stroke-linecap:round;stroke-linejoin:round"/>`

export const glyph = (name: IconName, size: number, tone: Tone, weight = 1.75) => svg(size, size, stroke(I[name], tone, weight), '0 0 24 24')

export type Status = 'needs' | 'working' | 'waiting' | 'idle' | 'ready' | 'verified' | 'merged' | 'done' | 'failed' | 'archived' | 'queued' | 'unmerged'

export const STATUS: Record<Status, { icon: IconName; tone: Tone; tint: string; color: string; box: string; word: string }> = {
  needs: { icon: 'needs', tone: 'red', tint: 'redTint', color: C.red, box: C.redTint, word: 'needs you' },
  working: { icon: 'working', tone: 'green', tint: 'greenTint', color: C.green, box: C.greenTint, word: 'working' },
  waiting: { icon: 'clock', tone: 'amber', tint: 'amberTint', color: C.amber, box: C.amberTint, word: 'waiting' },
  idle: { icon: 'idle', tone: 'grey', tint: 'greyTint', color: C.grey, box: C.greyTint, word: 'idle' },
  ready: { icon: 'ready', tone: 'amber', tint: 'amberTint', color: C.amber, box: C.amberTint, word: 'ready for verify' },
  verified: { icon: 'verified', tone: 'green', tint: 'greenTint', color: C.green, box: C.greenTint, word: 'verified' },
  merged: { icon: 'merged', tone: 'green', tint: 'greenTint', color: C.green, box: C.greenTint, word: 'merged' },
  done: { icon: 'done', tone: 'grey', tint: 'greyTint', color: C.grey, box: C.greyTint, word: 'done' },
  failed: { icon: 'failed', tone: 'red', tint: 'redTint', color: C.red, box: C.redTint, word: 'failed' },
  archived: { icon: 'archive', tone: 'grey', tint: 'greyTint', color: C.grey, box: C.greyTint, word: 'archived' },
  queued: { icon: 'queued', tone: 'grey', tint: 'greyTint', color: C.grey, box: C.greyTint, word: 'queued' },
  unmerged: { icon: 'unmerged', tone: 'amber', tint: 'amberTint', color: C.amber, box: C.amberTint, word: 'unmerged' },
}

export const statusBadge = (status: Status, size: 28 | 32) => square(STATUS[status].icon, STATUS[status].tone, STATUS[status].tint, size, size === 28 ? 8 : 10, size === 28 ? 16 : 18, 1.75)

export function square(name: IconName, tone: Tone, tint: string, size: number, radius: number, iconSize: number, weight = 2.2) {
  const at = (size - iconSize) / 2
  return svg(size, size, `<rect width="${size}" height="${size}" rx="${radius}" style="fill:var(--${tint})"/><g transform="translate(${at} ${at}) scale(${iconSize / 24})">${stroke(I[name], tone, weight)}</g>`)
}

const RING = 2 * Math.PI * 14

export function toneRing(done: number, total: number, tone: Tone) {
  const share = total ? Math.min(done / total, 1) : 0
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

export type FaceLook = { fill?: string; stroke?: string; ink: Tone; isUnderlined?: boolean }

const shell = (width: number, height: number, look: FaceLook) =>
  `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="9.5" style="fill:${look.fill ? `var(--${look.fill})` : 'none'};stroke:${look.stroke ? `var(--${look.stroke})` : 'none'}"/>`

const label = (text: string, x: number, height: number, ink: Tone, weight: number, isUnderlined = false) =>
  `<text x="${x}" y="${(height / 2 + 4.5).toFixed(1)}" style="fill:var(--${ink});font-size:13px;font-weight:${weight}${isUnderlined ? ';text-decoration:underline' : ''}">${escape(text)}</text>`

const glyphAt = (name: IconName, x: number, height: number, size: number, ink: Tone) =>
  `<g transform="translate(${x} ${(height - size) / 2}) scale(${size / 24})">${stroke(I[name], ink, 1.9)}</g>`

export function buttonFace(width: number, height: number, icon: IconName, text: string, look: FaceLook, left: number, gap: number, size = 16) {
  if (!text) return svg(width, height, shell(width, height, look) + glyphAt(icon, (width - size) / 2, height, size, look.ink))
  return svg(width, height, shell(width, height, look) + glyphAt(icon, left + 1, height, size, look.ink) + label(text, left + 1 + size + gap, height, look.ink, 600, look.isUnderlined))
}

export type ChipMark = { dot: Tone } | { icon: IconName } | undefined

export function chipFace(width: number, height: number, mark: ChipMark, text: string, count: string, look: FaceLook) {
  const markWidth = mark ? ('dot' in mark ? 8 : 14) : 0
  const markSvg = !mark ? '' : 'dot' in mark ? `<circle cx="17" cy="${height / 2}" r="4" style="fill:var(--${mark.dot})"/>` : glyphAt(mark.icon, 13, height, 14, look.ink)
  const textX = 13 + (markWidth ? markWidth + 8 : 0)
  return svg(width, height, shell(width, height, look) + markSvg + label(text, textX, height, look.ink, 600) + label(count, textX + Math.ceil(textWidth(text, 13, { isBold: true })) + 8, height, look.ink, 600))
}
