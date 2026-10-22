import type { AgentRecord, Board, Live, SessionState, WorkflowRecord } from '../../types'

import { BAR, BUTTON, CHECK, COUNTS, PERCENT, PILL } from '../theme/band'
import { barsWidth, dotsWidth, flexCount } from '../theme/strip'
import type { StripItem, StripTone } from '../theme/strip'
import { workflowRunsOf } from './agents'
import type { WorkflowRun } from './agents'
import { progressOf } from './board'
import type { Progress } from './board'
import { COLUMN, fit, textWidth, widthOf } from './layout'
import { rowsOf } from './rows'

const DIGIT = 0.62
export const HIT = 'band-hit-'
const MAX_BARS = 8
const PILL_WIDTH = 2 + PILL.left + PILL.icon + PILL.gap + PILL.right
const NEEDS = ' needs you'

export type BandAction = 'board' | 'chat'

export type BandActions = { board: () => void; chat: (id: string, name: string) => void }

export type AgentCounts = { agents: readonly AgentRecord[]; workflows: readonly WorkflowRecord[] }

export type Asker = { name: string; short: string; parent?: string; reason?: string; chat?: { id: string; name: string } }

export type BandItem = StripItem & { id: string; isRunning: boolean; asker?: Asker }

export const slotWidth = (text: string, size: number) => {
  const padded = text.replace(/\d+/g, digits => '0'.repeat(Math.max(2, digits.length)))
  return textWidth(padded.replace(/0/g, ''), size) + DIGIT * size * (padded.match(/0/g)?.length ?? 0)
}

export const bandAction = (element: string) => {
  const name = element.startsWith(HIT) ? element.slice(HIT.length) : ''
  return name === 'board' || name === 'chat' ? name : undefined
}

export const agentCountsOf = (agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[]): AgentCounts => ({ agents, workflows })

const counted = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const extrasOf = ({ subagents, workflows }: { subagents: number; workflows: number }) =>
  [subagents ? counted(subagents, 'subagent') : '', workflows ? counted(workflows, 'workflow') : ''].filter(Boolean)

const SESSION_TONE: Record<SessionState, StripTone> = { 'needs-you': 'red', waiting: 'amber', working: 'green', done: 'grey' }

const agentTone = (agent: { state: string; asking?: unknown }): StripTone =>
  agent.state === 'running' ? (agent.asking ? 'red' : 'green') : agent.state === 'failed' ? 'failed' : 'grey'

const runTone = (run: WorkflowRun): StripTone => (run.counts.asking ? 'red' : run.state === 'running' ? 'green' : run.state === 'failed' ? 'failed' : 'grey')

const nameOf = (agent: Pick<AgentRecord, 'name' | 'description'>) => agent.name || agent.description

type Place = { parent?: string; chat?: { id: string; name: string } }

function treeOf(agents: readonly AgentRecord[]) {
  const ids = new Set(agents.map(one => one.id))
  const order: { agent: AgentRecord; parent?: AgentRecord }[] = []
  const visit = (agent: AgentRecord, parent?: AgentRecord) => {
    order.push({ agent, parent })
    agents.filter(one => one.parentAgentId === agent.id).forEach(child => visit(child, agent))
  }
  agents.filter(one => !one.parentAgentId || !ids.has(one.parentAgentId)).forEach(root => visit(root))
  return order
}

function subagentItems(agents: readonly AgentRecord[], place: Place): BandItem[] {
  return treeOf(agents).map(({ agent, parent }) => ({
    id: agent.id,
    kind: 'subagent',
    tone: agentTone(agent),
    fill: 1,
    isChild: true,
    isRunning: agent.state === 'running',
    asker: agent.state === 'running' && agent.asking ? { name: nameOf(agent), short: nameOf(agent), parent: parent ? nameOf(parent) : place.parent, reason: agent.asking.text, chat: place.chat } : undefined,
  }))
}

function runItems(runs: readonly WorkflowRun[], place: Place): BandItem[] {
  return runs.map(run => {
    const asking = run.agents.find(one => one.state === 'running' && one.asking)
    const finished = run.counts.done + run.counts.failed
    return {
      id: run.id,
      kind: 'workflow',
      tone: runTone(run),
      fill: run.state === 'running' ? (run.counts.total ? finished / run.counts.total : 0) : 1,
      pieces: Math.max(1, run.phases.length),
      isRunning: run.state === 'running',
      asker: asking?.asking ? { name: asking.label, short: asking.label, parent: run.name, reason: asking.asking.text, chat: place.chat } : undefined,
    }
  })
}

export function bandItemsOf(segments: Progress['segments'], current: Board | null, { agents, workflows }: AgentCounts): BandItem[] {
  const own = agents.filter(one => !one.parentSessionId)
  const items: BandItem[] = subagentItems(
    own.filter(one => !one.run),
    {},
  )
  for (const segment of segments) {
    const row = current?.sessions.find(one => one.id === segment.id)
    const name = row?.name ?? segment.id
    const chat = { id: segment.id, name }
    const remote = agents.filter(one => one.parentSessionId === segment.id)
    const subs = subagentItems(
      remote.filter(one => !one.run),
      { parent: name, chat },
    )
    const runs = runItems(
      workflowRunsOf(
        remote.map(({ parentSessionId, ...one }) => one),
        [],
      ),
      { chat },
    )
    const isAsking = segment.state === 'needs-you'
    const child = isAsking ? [...subs, ...runs].find(one => one.asker && one.asker.reason === row?.needsYou) : undefined
    items.push({
      id: segment.id,
      kind: 'session',
      tone: SESSION_TONE[segment.state],
      fill: segment.fill,
      isWorking: segment.state === 'working',
      isRunning: segment.state !== 'done',
      asker: isAsking ? (child?.asker ?? { name, short: name, reason: row?.needsYou, chat }) : undefined,
    })
    items.push(...subs, ...runs)
  }
  items.push(...runItems(workflowRunsOf(agents, workflows), {}))
  return items
}

const headOf = (asker: Asker) => (asker.parent ? `${asker.name}, in ${asker.parent},${NEEDS}` : `${asker.name}${NEEDS}`)

const countsWidthOf = (text: string) => COUNTS.left + COUNTS.icon + COUNTS.gap + slotWidth(text, 13) + COUNTS.right

export type FitInput = { room: number; gap: number; items: readonly StripItem[]; counts: number; full?: string; short?: string }

export function fitBand({ room, gap, items, counts, full, short }: FitInput) {
  const dots = dotsWidth(items)
  const bars = barsWidth(items)
  const isForced = flexCount(items) > MAX_BARS
  if (full === undefined) {
    const least = isForced ? dots : bars
    const showCounts = room - counts - gap >= least
    const left = showCounts ? room - counts - gap : room
    const isDots = isForced || left < bars
    return { pill: '', showCounts, isDots, strip: Math.round(isDots ? dots : left) }
  }
  const brief = short ?? full
  const tries = isForced
    ? [{ text: full, isDots: true }, { text: brief, isDots: true }]
    : [{ text: full, isDots: false }, { text: brief, isDots: false }, { text: brief, isDots: true }]
  for (const { text, isDots } of tries) {
    const left = room - PILL_WIDTH - widthOf(text)
    if (left >= (isDots ? dots : bars)) return { pill: text, showCounts: false, isDots, strip: Math.round(isDots ? dots : left) }
  }
  return { pill: fit(brief, room - dots - PILL_WIDTH), showCounts: false, isDots: true, strip: dots }
}

export function bandProgress(current: Board | null, live: Live) {
  const sessions = rowsOf(current, live)
    .filter(row => current || row.live?.startedBy === live.self)
    .map(row => ({ ...row.board, id: row.id, name: row.name, state: row.state }))
  const progress = progressOf({ sessions, needsYou: [], repos: [], source: 'tool' }, live)
  return progress.total ? progress : undefined
}

const IDLE_PROGRESS: Progress = { segments: [], percent: 0, done: 0, total: 0 }

export function bandProgressWith(current: Board | null, live: Live, { agents, workflows }: AgentCounts) {
  const progress = bandProgress(current, live)
  if (progress) return progress
  const isBusy = agents.some(one => one.state === 'running') || workflowRunsOf(agents, workflows).some(run => run.state === 'running')
  return isBusy ? IDLE_PROGRESS : undefined
}

export function bandViewOf(columns: number, current: Board | null, progress: Progress, from: string, isPaneOpen: boolean, agents: AgentCounts, act: BandActions) {
  const width = columns * COLUMN - 16
  const isNarrow = width < 600
  const items = bandItemsOf(progress.segments, current, agents)
  const count = (state: SessionState) => progress.segments.filter(one => one.state === state).length
  const asker = items.find(one => one.asker)?.asker
  const isAllDone = !asker && progress.total > 0 && progress.done === progress.total
  const percent = progress.total ? progress.percent : Math.round((100 * items.filter(one => !one.isRunning).length) / Math.max(1, items.length))
  const digits = String(progress.total).length
  const number = (value: number) => String(value).padStart(digits, ' ')
  const counts = isAllDone ? `${number(progress.total)} done · ${number(0)} open` : progress.total ? `${number(count('working'))} working · ${number(count('waiting'))} waiting` : ''
  const running = (kind: StripItem['kind']) => items.filter(one => one.kind === kind && one.isRunning).length
  const parts = isAllDone || asker ? [] : extrasOf({ subagents: running('subagent'), workflows: running('workflow') })
  const via = from ? `, from ${from}` : ''
  const full = asker ? `${headOf(asker)}${asker.reason ? ` · ${asker.reason}` : ''}` : undefined
  const alt = asker
    ? `Master session: ${headOf(asker)}${asker.reason ? `, ${asker.reason}` : ''}${via}`
    : isAllDone
      ? `Master session: all ${progress.total} done${via}`
      : `Master session: ${[`${percent} percent`, ...(progress.total ? [`${count('working')} working`, `${count('waiting')} waiting`] : []), ...parts].join(', ')}${via}`
  const chat = asker?.chat
  const action = asker
    ? chat
      ? { name: 'chat' as const, label: 'Open chat', icon: 'chat' as const, press: () => act.chat(chat.id, chat.name) }
      : undefined
    : isPaneOpen
      ? undefined
      : { name: 'board' as const, label: isNarrow ? 'Board' : 'Open board', icon: 'panel' as const, press: act.board }
  const actionWidth = action ? 2 + BUTTON.left + BUTTON.icon + BUTTON.gap + widthOf(action.label) + BUTTON.right : 0
  const padLeft = asker ? (isNarrow ? 8 : 10) : isNarrow ? 12 : 16
  const padRight = isNarrow ? 6 : 8
  const gap = BAR.gap
  const leadWidth = asker ? 0 : isAllDone ? CHECK : PERCENT
  const room = width - padLeft - padRight - 2 - leadWidth - gap - (action ? actionWidth + gap : 0)
  const fitOf = (text: string) => fitBand({ room, gap, items, counts: countsWidthOf(text), full, short: asker ? `${asker.short}${NEEDS}` : undefined })
  const extras = parts.join(' · ')
  const wide = fitOf([counts, extras].filter(Boolean).join(' · '))
  const fitted = wide.showCounts || !extras || !counts ? wide : fitOf(counts)
  const { showCounts } = fitted
  const pillText = fitted.pill
  return { items, asker, isAllDone, percent, counts, extras: fitted === wide ? extras : '', alt, action, actionWidth, padLeft, padRight, gap, fitted, showCounts, pillText }
}

export type BandView = ReturnType<typeof bandViewOf>
