import type { Board, Live, SessionState } from '../../types'

import { GAP, dotsWidth } from '../theme/strip'
import { progressOf } from './board'
import type { Progress } from './board'
import { COLUMN, fit, textWidth, widthOf } from './layout'

export const PERCENT = 40
const DIGIT = 0.62
export const HIT = 'band-hit-'
const BAR = 24
const MAX_BARS = 8
const PILL = 2 + 9 + 15 + 6 + 12
const NEEDS = ' needs you'

export type BandAction = 'board' | 'chat' | 'summary'

export type BandActions = { board: () => void; summary: () => void; chat: (id: string, name: string) => void }

export const slotWidth = (text: string, size: number) => {
  const padded = text.replace(/\d+/g, digits => '0'.repeat(Math.max(2, digits.length)))
  return textWidth(padded.replace(/0/g, ''), size) + DIGIT * size * (padded.match(/0/g)?.length ?? 0)
}

export const bandAction = (element: string) => {
  const name = element.startsWith(HIT) ? element.slice(HIT.length) : ''
  return name === 'board' || name === 'chat' || name === 'summary' ? name : undefined
}

export type FitInput = { room: number; gap: number; count: number; counts: number; name?: string; reason?: string }

export function fitBand({ room, gap, count, counts, name, reason }: FitInput) {
  const dots = dotsWidth(count)
  const bars = count * BAR + (count - 1) * GAP
  const isForced = count > MAX_BARS
  if (name === undefined) {
    const least = isForced ? dots : bars
    const showCounts = room - counts - gap >= least
    const left = showCounts ? room - counts - gap : room
    const isDots = isForced || left < bars
    return { pill: '', showCounts, isDots, strip: Math.round(isDots ? dots : left) }
  }
  const full = reason ? `${name}${NEEDS} · ${reason}` : `${name}${NEEDS}`
  const short = `${name}${NEEDS}`
  const tries = isForced
    ? [{ text: full, isDots: true }, { text: short, isDots: true }]
    : [{ text: full, isDots: false }, { text: short, isDots: false }, { text: short, isDots: true }]
  for (const { text, isDots } of tries) {
    const left = room - PILL - widthOf(text)
    if (left >= (isDots ? dots : bars)) return { pill: text, showCounts: false, isDots, strip: Math.round(isDots ? dots : left) }
  }
  const space = room - dots - PILL
  const pill = space - widthOf(NEEDS) >= widthOf(`${name.slice(0, 3)}…`) ? `${fit(name, space - widthOf(NEEDS))}${NEEDS}` : fit(name, space)
  return { pill, showCounts: false, isDots: true, strip: dots }
}

export function bandProgress(current: Board | null, state: Live) {
  const progress = progressOf(current, state)
  return current && progress.total ? progress : undefined
}

export function bandViewOf(columns: number, current: Board, progress: Progress, from: string, isPaneOpen: boolean, act: BandActions) {
  const width = columns * COLUMN - 16
  const isNarrow = width < 600
  const segments = progress.segments
  const count = (state: SessionState) => segments.filter(one => one.state === state).length
  const askingId = segments.find(one => one.state === 'needs-you')?.id
  const asking = askingId ? current.sessions.find(one => one.id === askingId) : undefined
  const isAllDone = !asking && progress.done === progress.total
  const digits = String(progress.total).length
  const number = (value: number) => String(value).padStart(digits, ' ')
  const counts = isAllDone ? `${number(progress.total)} done · ${number(0)} open` : `${number(count('working'))} working · ${number(count('waiting'))} waiting`
  const via = from ? `, from ${from}` : ''
  const alt = asking
    ? `Master session: ${asking.name} needs you${asking.needsYou ? `, ${asking.needsYou}` : ''}${via}`
    : isAllDone
      ? `Master session: all ${progress.total} done${via}`
      : `Master session: ${progress.percent} percent, ${count('working')} working, ${count('waiting')} waiting${via}`
  const action = asking
    ? { name: 'chat' as const, label: 'Open chat', icon: 'chat' as const, press: () => act.chat(asking.id, asking.name) }
    : isAllDone
      ? isPaneOpen
        ? undefined
        : { name: 'summary' as const, label: 'Summary', icon: 'panel' as const, press: act.summary }
      : isPaneOpen
        ? undefined
        : { name: 'board' as const, label: isNarrow ? 'Board' : 'Open board', icon: 'panel' as const, press: act.board }
  const [left, right] = asking ? (isNarrow ? [8, 10] : [12, 14]) : [10, 12]
  const actionWidth = action ? 2 + left + 15 + 6 + widthOf(action.label) + right : 0
  const padLeft = asking ? (isNarrow ? 8 : 10) : isNarrow ? 12 : 16
  const padRight = isNarrow ? 6 : 8
  const gap = asking && isNarrow ? 6 : isNarrow ? 10 : 12
  const countsWidth = 6 + 15 + 6 + slotWidth(counts, 13) + 8
  const leadWidth = asking ? 0 : isAllDone ? 18 : PERCENT
  const room = width - padLeft - padRight - 2 - leadWidth - gap - (action ? actionWidth + gap : 0)
  const fitted = fitBand({ room, gap, count: segments.length, counts: countsWidth, name: asking?.name, reason: asking?.needsYou })
  const { showCounts } = fitted
  const pillText = fitted.pill
  return { segments, asking, isAllDone, counts, alt, action, left, right, actionWidth, padLeft, padRight, gap, fitted, showCounts, pillText }
}

export type BandView = ReturnType<typeof bandViewOf>
