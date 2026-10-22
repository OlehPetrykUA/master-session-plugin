import type { AgentRecord, Board, Live, SessionState, WorkflowRecord } from '../../types'

import { BAR, BUTTON, CHECK, COUNTS, PERCENT, PILL } from '../theme/band'
import { GAP, dotsWidth } from '../theme/strip'
import { subagentsOf, workflowRunsOf } from './agents'
import { progressOf } from './board'
import type { Progress } from './board'
import { COLUMN, fit, textWidth, widthOf } from './layout'
import { rowsOf } from './rows'

const DIGIT = 0.62
export const HIT = 'band-hit-'
const SEGMENT = 24
const MAX_BARS = 8
const PILL_WIDTH = 2 + PILL.left + PILL.icon + PILL.gap + PILL.right
const NEEDS = ' needs you'

export type BandAction = 'board' | 'chat'

export type BandActions = { board: () => void; chat: (id: string, name: string) => void }

export type AgentCounts = { subagents: number; workflows: number }

export const slotWidth = (text: string, size: number) => {
  const padded = text.replace(/\d+/g, digits => '0'.repeat(Math.max(2, digits.length)))
  return textWidth(padded.replace(/0/g, ''), size) + DIGIT * size * (padded.match(/0/g)?.length ?? 0)
}

export const bandAction = (element: string) => {
  const name = element.startsWith(HIT) ? element.slice(HIT.length) : ''
  return name === 'board' || name === 'chat' ? name : undefined
}

const isRunning = (one: { state: string }) => one.state === 'running'

export const agentCountsOf = (agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[]): AgentCounts => ({
  subagents: subagentsOf(agents).filter(isRunning).length,
  workflows: workflowRunsOf(agents, workflows).filter(isRunning).length,
})

const counted = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const extrasOf = ({ subagents, workflows }: AgentCounts) => [subagents ? counted(subagents, 'subagent') : '', workflows ? counted(workflows, 'workflow') : ''].filter(Boolean)

const countsWidthOf = (text: string) => COUNTS.left + COUNTS.icon + COUNTS.gap + slotWidth(text, 13) + COUNTS.right

export type FitInput = { room: number; gap: number; count: number; counts: number; name?: string; reason?: string }

export function fitBand({ room, gap, count, counts, name, reason }: FitInput) {
  const dots = dotsWidth(count)
  const bars = count * SEGMENT + (count - 1) * GAP
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
    const left = room - PILL_WIDTH - widthOf(text)
    if (left >= (isDots ? dots : bars)) return { pill: text, showCounts: false, isDots, strip: Math.round(isDots ? dots : left) }
  }
  return { pill: fit(short, room - dots - PILL_WIDTH), showCounts: false, isDots: true, strip: dots }
}

export function bandProgress(current: Board | null, live: Live) {
  const sessions = rowsOf(current, live)
    .filter(row => current || row.live?.startedBy === live.self)
    .map(row => ({ ...row.board, id: row.id, name: row.name, state: row.state }))
  const progress = progressOf({ sessions, needsYou: [], repos: [], source: 'tool' }, live)
  return progress.total ? progress : undefined
}

export function bandViewOf(columns: number, current: Board | null, progress: Progress, from: string, isPaneOpen: boolean, agents: AgentCounts, act: BandActions) {
  const width = columns * COLUMN - 16
  const isNarrow = width < 600
  const segments = progress.segments
  const count = (state: SessionState) => segments.filter(one => one.state === state).length
  const askingId = segments.find(one => one.state === 'needs-you')?.id
  const asking = askingId ? current?.sessions.find(one => one.id === askingId) : undefined
  const isAllDone = !asking && progress.done === progress.total
  const digits = String(progress.total).length
  const number = (value: number) => String(value).padStart(digits, ' ')
  const counts = isAllDone ? `${number(progress.total)} done · ${number(0)} open` : `${number(count('working'))} working · ${number(count('waiting'))} waiting`
  const parts = isAllDone || asking ? [] : extrasOf(agents)
  const via = from ? `, from ${from}` : ''
  const alt = asking
    ? `Master session: ${asking.name} needs you${asking.needsYou ? `, ${asking.needsYou}` : ''}${via}`
    : isAllDone
      ? `Master session: all ${progress.total} done${via}`
      : `Master session: ${[`${progress.percent} percent`, `${count('working')} working`, `${count('waiting')} waiting`, ...parts].join(', ')}${via}`
  const action = asking
    ? { name: 'chat' as const, label: 'Open chat', icon: 'chat' as const, press: () => act.chat(asking.id, asking.name) }
    : isPaneOpen
      ? undefined
      : { name: 'board' as const, label: isNarrow ? 'Board' : 'Open board', icon: 'panel' as const, press: act.board }
  const actionWidth = action ? 2 + BUTTON.left + BUTTON.icon + BUTTON.gap + widthOf(action.label) + BUTTON.right : 0
  const padLeft = asking ? (isNarrow ? 8 : 10) : isNarrow ? 12 : 16
  const padRight = isNarrow ? 6 : 8
  const gap = BAR.gap
  const leadWidth = asking ? 0 : isAllDone ? CHECK : PERCENT
  const room = width - padLeft - padRight - 2 - leadWidth - gap - (action ? actionWidth + gap : 0)
  const fitOf = (text: string) => fitBand({ room, gap, count: segments.length, counts: countsWidthOf(text), name: asking?.name, reason: asking?.needsYou })
  const extras = parts.join(' · ')
  const wide = fitOf(extras ? `${counts} · ${extras}` : counts)
  const fitted = wide.showCounts || !extras ? wide : fitOf(counts)
  const { showCounts } = fitted
  const pillText = fitted.pill
  return { segments, asking, isAllDone, counts, extras: fitted === wide ? extras : '', alt, action, actionWidth, padLeft, padRight, gap, fitted, showCounts, pillText }
}

export type BandView = ReturnType<typeof bandViewOf>
