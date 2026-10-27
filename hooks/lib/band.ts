import type { AgentRecord, Board, Live, Repo, Running, WorkflowRecord } from '../../types'

import { BAR, BUTTON, CHECK, PERCENT, PILL } from '../theme/band'
import { PERSONA_GLYPH } from '../theme/icons'
import type { IconName } from '../theme/icons'
import type { BarTone } from '../theme/strip'
import { workflowRunsOf } from './agents'
import type { WorkflowRun } from './agents'
import { progressOf, stepOf } from './board'
import type { Progress } from './board'
import { compactOf } from './format'
import { CH, fit, textWidth, widthOf } from './layout'
import { CHAT_LABEL, agentIdsOf, countsOfItems, displayNameOf, isGhostRun, itemsOf, lineOf, listedRowsOf, nameText, personaOfType, runningTextOf, sessionNameOf } from './list'
import type { ListItem } from './list'
import { familyOf, rowsOf } from './rows'
import { runStartOf } from './totals'

const DIGIT = 0.64
export const HIT = 'band-hit-'
export const BAR_MIN = 48
const WORKING_CAP = 0.85
const VERIFYING_VALUE = 0.9
const NARROW_BELOW = 600
const PERCENT_BELOW = 340
export const ELAPSED_ICON = 12
export const ELAPSED_GAP = 4
export const PILL_WIDTH = 2 + PILL.left + PILL.icon + PILL.gap + PILL.right
const NEEDS = ' needs you'

export type BandAction = 'board' | 'chat'

type BandActions = { board: () => void; chat: (id: string, name: string) => void }

export type AgentCounts = { agents: readonly AgentRecord[]; workflows: readonly WorkflowRecord[]; at: number }

type Asker = { name: string; short: string; glyph: IconName; parent?: string; reason?: string; since?: number; chat?: { id: string; name: string } }

type Unit = { value: number; isRunning: boolean; isFinished: boolean; asker?: Asker }

type CountPart = { text: string; isNumber: boolean }

export const bandAction = (element: string) => {
  const name = element.startsWith(HIT) ? element.slice(HIT.length) : ''
  return name === 'board' || name === 'chat' ? name : undefined
}

export const agentCountsOf = (agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[], at: number): AgentCounts => ({ agents, workflows, at })

const clamp = (value: number) => Math.min(1, Math.max(0, value))

const agentAskerOf = (type: string, label: string) => {
  const persona = personaOfType(type)
  const glyph = PERSONA_GLYPH[persona]
  return { name: glyph ? persona : label, short: persona, glyph: glyph ?? ('agent' as const) }
}

type Place = { parent?: string }

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

function subagentUnits(agents: readonly AgentRecord[], place: Place): Unit[] {
  return treeOf(agents).map(({ agent, parent }) => {
    const isRunning = agent.state === 'running'
    return {
      value: isRunning ? 0 : 1,
      isRunning,
      isFinished: !isRunning,
      asker: isRunning && agent.asking ? { ...agentAskerOf(agent.type, agent.name || agent.description), parent: parent ? agentAskerOf(parent.type, parent.name || parent.description).name : place.parent, reason: agent.asking.text, since: agent.asking.since } : undefined,
    }
  })
}

function runUnits(runs: readonly WorkflowRun[]): Unit[] {
  return runs.map(run => {
    const asking = run.agents.find(one => one.state === 'running' && one.asking)
    const isRunning = run.state === 'running'
    const finished = run.counts.done + run.counts.failed
    return {
      value: isRunning ? (run.counts.total ? finished / run.counts.total : 0) : 1,
      isRunning,
      isFinished: !isRunning,
      asker: asking?.asking ? { ...agentAskerOf(asking.type, asking.label), parent: run.name, reason: asking.asking.text, since: asking.asking.since } : undefined,
    }
  })
}

const liveRunsOf = ({ agents, workflows, at }: AgentCounts) => workflowRunsOf(agents, workflows).filter(run => !isGhostRun(run, at))

const remoteOf = ({ agents, workflows, at }: AgentCounts, id: string, place: Place) => {
  const mine = agents.filter(one => one.parentSessionId === id)
  const runs = runUnits(
    workflowRunsOf(
      mine.map(({ parentSessionId, ...one }) => one),
      workflows.filter(one => one.parentSessionId === id).map(({ parentSessionId, ...one }) => one),
    ).filter(run => !isGhostRun(run, at)),
  )
  return { subs: subagentUnits(mine.filter(one => !one.run), place), runs }
}

export function bandUnitsOf(segments: Progress['segments'], current: Board | null, counts: AgentCounts, live: Live, trees: readonly Repo[] = [], items: readonly ListItem[] = bandItemsOf(current, counts, live, trees)): Unit[] {
  const { agents } = counts
  const own = agents.filter(one => !one.parentSessionId)
  const units: Unit[] = subagentUnits(
    own.filter(one => !one.run),
    {},
  )
  const known = new Set(segments.map(one => one.id))
  const taken = agentIdsOf(agents, counts.workflows)
  for (const segment of segments) {
    if (taken.has(segment.id)) continue
    const row = current?.sessions.find(one => one.id === segment.id)
    const name = row?.name ?? segment.id
    const found = live.sessions.find(one => one.id === segment.id)
    const chat = found?.startedBy === live.self ? { id: segment.id, name } : undefined
    const display = sessionNameOf(found?.title || row?.title || name, row?.persona)
    const self = { name: nameText(display), short: display.persona, glyph: PERSONA_GLYPH[display.persona] ?? ('session' as const) }
    const { subs, runs } = remoteOf(counts, segment.id, { parent: display.persona === 'Session' ? display.task : display.persona })
    const group = items.find(one => one.kind === 'session' && one.id === segment.id)?.group
    const isAsking = group === 'needs-you'
    const child = isAsking ? [...subs, ...runs].find(one => one.asker && one.asker.reason === row?.needsYou) : undefined
    const isDone = group === 'done'
    units.push({
      value: isDone ? 1 : clamp(segment.fill),
      isRunning: group === 'working',
      isFinished: isDone,
      asker: isAsking ? (child?.asker ?? { ...self, reason: row?.needsYou, chat }) : undefined,
    })
    units.push(...subs, ...runs)
  }
  const gone = [...new Set(agents.flatMap(one => (one.parentSessionId && !known.has(one.parentSessionId) ? [one.parentSessionId] : [])))]
  gone.forEach(id => {
    const { subs, runs } = remoteOf(counts, id, {})
    units.push(...subs, ...runs)
  })
  units.push(...runUnits(liveRunsOf(counts)))
  return units
}

const firstAskerOf = (units: readonly Unit[]) => units.reduce<Asker | undefined>((first, one) => (one.asker && (!first || (one.asker.since ?? Infinity) < (first.since ?? Infinity)) ? one.asker : first), undefined)

export const askToolOf = (reason: string | undefined) => {
  const found = /^Allow ([^:\n]{1,40})(?::|$)/.exec(reason ?? '')
  return found ? `Allow ${found[1]}` : reason
}

const headOf = (asker: Asker) => (asker.parent ? `${asker.name}, in ${asker.parent},${NEEDS}` : `${asker.name}${NEEDS}`)

export const overallOf = (units: readonly Unit[]) => (units.length ? units.reduce((sum, one) => sum + one.value, 0) / units.length : 0)

export const percentOf = (units: readonly Unit[]) => {
  if (!units.length) return 0
  if (units.every(one => one.isFinished)) return 100
  return Math.min(99, Math.floor(overallOf(units) * 100 + 1e-9))
}

type Piece = NonNullable<Board['plan']>[number]

const pieceValueOf = (piece: Piece) => {
  if (piece.state === 'done') return 1
  if (piece.state === 'verifying') return VERIFYING_VALUE
  if (piece.state !== 'working') return 0
  const step = stepOf(piece.progress)
  return step && step.total ? Math.min(WORKING_CAP, step.done / step.total) : 0
}

const piecesOf = (current: Board | null) => {
  const counted = (current?.plan ?? []).filter(one => one.state !== 'dropped')
  return counted.length ? counted : undefined
}

export const bandItemsOf = (current: Board | null, { agents, workflows, at }: AgentCounts, live: Live, trees: readonly Repo[] = []) =>
  itemsOf(rowsOf(current, live), agents, workflows, { at, trees, sessions: familyOf(live) })

export const countsOf = (done: number, total: number): CountPart[] => [{ text: String(done), isNumber: true }, { text: '/', isNumber: false }, { text: String(total), isNumber: true }]

export const countsText = (parts: readonly CountPart[]) => parts.map(one => one.text).join('')

export const countsWidthOf = (parts: readonly CountPart[]) => parts.reduce((sum, one) => sum + (one.isNumber ? DIGIT * 13 * one.text.length : textWidth(one.text, 13)), 0)

export function bandProgress(current: Board | null, live: Live) {
  const sessions = rowsOf(current, live)
    .filter(row => current || row.live?.startedBy === live.self)
    .map(row => ({ ...row.board, id: row.id, name: row.name, state: row.state }))
  const progress = progressOf({ sessions, needsYou: [], repos: [], source: 'tool' }, live)
  return progress.total ? progress : undefined
}

export function askingChatOf(current: Board | null, live: Live, agents: AgentCounts, trees: readonly Repo[]) {
  const chat = firstAskerOf(bandUnitsOf(bandProgress(current, live)?.segments ?? [], current, agents, live, trees))?.chat
  return chat && chat.id !== live.self ? chat : undefined
}

const IDLE_PROGRESS: Progress = { segments: [], total: 0 }

export function bandProgressWith(current: Board | null, live: Live, counts: AgentCounts) {
  const { agents } = counts
  const progress = bandProgress(current, live)
  if (progress) return progress
  const isBusy = agents.some(one => one.state === 'running') || liveRunsOf(counts).some(run => run.state === 'running')
  return isBusy || piecesOf(current) ? IDLE_PROGRESS : undefined
}

type Runs = Readonly<Record<string, Running>>

export type Now = { kind: 'running' | 'idle' | 'done'; icon?: { name: IconName; alt: string }; head: string; tail: string; more: string }

const KIND_ALT = { session: 'session', subagent: 'subagent', workflow: 'workflow' } as const

const KIND_GLYPH = { session: 'session', subagent: 'agent', workflow: 'flow' } as const

const startOf = (item: ListItem) => (item.kind === 'session' ? (item.row.live?.createdAt ?? -Infinity) : item.kind === 'subagent' ? item.agent.startedAt : item.run.startedAt)

const newestOf = (items: readonly ListItem[]) => items.filter(one => one.group === 'working').reduce<ListItem | undefined>((best, one) => (!best || startOf(one) > startOf(best) ? one : best), undefined)

function commandOf(item: ListItem, running: Runs) {
  if (item.status !== 'working') return ''
  if (item.kind !== 'workflow') return running[item.id] ? runningTextOf(running[item.id] as Running) : ''
  const agent = item.run.agents.filter(one => one.state === 'running').reduce<(typeof item.run.agents)[number] | undefined>((best, one) => (!best || one.startedAt > best.startedAt ? one : best), undefined)
  const run = agent && running[agent.id]
  return run ? runningTextOf(run) : ''
}

const eventOf = (items: readonly ListItem[], context: Parameters<typeof lineOf>[1]) => {
  const endOf = (item: ListItem) => (item.kind === 'session' ? (item.row.live?.lastActivityAt ?? 0) : item.kind === 'subagent' ? (item.agent.endedAt ?? 0) : (item.run.endedAt ?? 0))
  const last = items.filter(one => one.group === 'done').reduce<ListItem | undefined>((best, one) => (!best || endOf(one) > endOf(best) ? one : best), undefined)
  if (!last) return ''
  const line = lineOf(last, context)
  return [line.word?.text, line.text, displayNameOf(last).task].filter(Boolean).join(' · ')
}

export const nowTextOf = (now: Now) => [now.head, now.tail].filter(Boolean).join(' · ') + (now.more ? ` ${now.more}` : '')

export function bandNowOf(items: readonly ListItem[], running: Runs, context: Parameters<typeof lineOf>[1], { isAllDone, total, isNarrow, isTiny }: { isAllDone: boolean; total: number; isNarrow: boolean; isTiny: boolean }): Now {
  if (isAllDone) return { kind: 'done', icon: { name: 'merged', alt: 'all done' }, head: `All ${total} done`, tail: isTiny ? '' : eventOf(items, context), more: '' }
  const newest = newestOf(items)
  if (!newest) {
    const waiting = countsOfItems(items, 0).waiting
    return { kind: 'idle', head: 'Nothing running', tail: !isTiny && waiting ? `${waiting} waiting on you or a review` : '', more: '' }
  }
  const name = displayNameOf(newest)
  const command = commandOf(newest, running)
  const more = items.filter(one => one.group === 'working').length - 1
  return {
    kind: 'running',
    icon: { name: PERSONA_GLYPH[name.persona] ?? KIND_GLYPH[newest.kind as keyof typeof KIND_GLYPH], alt: KIND_ALT[newest.kind as keyof typeof KIND_ALT] },
    head: isTiny ? name.persona : nameText(name),
    tail: isNarrow ? '' : command,
    more: isNarrow || more < 1 ? '' : `+${more} more`,
  }
}

export const bandSignatureOf = (view: BandView) => [view.summary, view.tone, view.isRunning, view.action?.name ?? ''].join('|')

export function bandViewOf(columns: number, current: Board | null, progress: Progress, isPaneOpen: boolean, agents: AgentCounts, act: BandActions, live: Live, trees: readonly Repo[] = [], running: Runs = {}) {
  const width = columns * CH - 16
  const isNarrow = width < NARROW_BELOW
  const isTiny = width < PERCENT_BELOW
  const items = bandItemsOf(current, agents, live, trees)
  const units = bandUnitsOf(progress.segments, current, agents, live, trees, items)
  const asker = firstAskerOf(units)
  const pieces = piecesOf(current)
  const isRunning = units.some(one => one.isRunning)
  const isPlanDone = !!pieces && pieces.every(one => one.state === 'done')
  const isAllDone = !asker && units.length > 0 && units.every(one => one.isFinished)
  const overall = pieces ? pieces.reduce((sum, one) => sum + pieceValueOf(one), 0) / pieces.length : overallOf(units)
  const percent = pieces ? (isPlanDone ? 100 : Math.min(99, Math.floor(overall * 100 + 1e-9))) : percentOf(units)
  const total = pieces ? pieces.length : units.length
  const done = pieces ? pieces.filter(one => one.state === 'done').length : units.filter(one => one.isFinished).length
  const tone: BarTone = asker ? 'red' : isAllDone || isRunning ? 'green' : 'grey'
  const hasPercent = !asker && !isAllDone && !isTiny
  const parts = asker || isAllDone ? [] : countsOf(done, total)
  const reason = askToolOf(asker?.reason)
  const full = asker ? `${headOf(asker)}${reason ? ` · ${reason}` : ''}` : ''
  const short = asker ? `${asker.short}${NEEDS}` : ''
  const context = { at: agents.at, trees, sessions: familyOf(live), agents: agents.agents, rows: rowsOf(current, live), running }
  const size = { isAllDone, total: units.length }
  const now = asker ? undefined : bandNowOf(items, running, context, { ...size, isNarrow, isTiny })
  const wide = asker ? undefined : bandNowOf(items, running, context, { ...size, isNarrow: false, isTiny: false })
  const elapsed = compactOf(agents.at - runStartOf(listedRowsOf(context.rows, agents.agents, agents.workflows), agents.agents, current, agents.at))
  const waiting = countsOfItems(items, 0).waiting
  const nowAlt = !wide ? '' : wide.kind === 'running' ? `Now ${wide.head}${wide.tail ? `, ${wide.tail}` : ''}${wide.more ? `, and ${wide.more.slice(1)} running` : ''}.` : `Nothing running${waiting ? `, ${waiting} waiting` : ''}.`
  const summary = asker
    ? `Master session: ${headOf(asker)}${reason ? `, ${reason}` : ''}`
    : isAllDone
      ? `Master session: all ${units.length} done${wide?.tail ? `. Latest ${wide.tail}` : ''}.`
      : `Master session: ${percent} percent, ${done} of ${total} done. ${nowAlt}`
  const alt = asker ? summary : `${summary} ${elapsed} elapsed.`
  const chat = asker?.chat && asker.chat.id !== live?.self ? asker.chat : undefined
  const action = asker
    ? chat
      ? { name: 'chat' as const, label: CHAT_LABEL, accessibleName: CHAT_LABEL, icon: 'chat' as const, isIconOnly: isNarrow, press: () => act.chat(chat.id, chat.name) }
      : undefined
    : isPaneOpen
      ? undefined
      : { name: 'board' as const, label: isNarrow ? 'Board' : 'Open board', accessibleName: 'Open board', icon: 'panel' as const, isIconOnly: false, press: act.board }
  const actionWidth = action ? (action.isIconOnly ? BUTTON.height : 2 + BUTTON.left + BUTTON.icon + BUTTON.gap + widthOf(action.label, { isBold: true }) + BUTTON.right) : 0
  const padLeft = asker ? 8 : isNarrow ? 12 : 16
  const padRight = action ? (isNarrow ? 6 : 8) : isNarrow ? 12 : 16
  const gap = BAR.gap
  const inner = width - padLeft - padRight - 2
  const hasElapsed = !asker && !isNarrow
  const elapsedWidth = hasElapsed ? ELAPSED_ICON + ELAPSED_GAP + textWidth(elapsed, 12) + 1 : 0
  const around = (lead: number, counts: number) => {
    const sides = [lead, counts, elapsedWidth, actionWidth].filter(Boolean)
    return inner - sides.reduce((sum, one) => sum + one, 0) - sides.length * gap
  }
  let pillText = ''
  let leadWidth = isAllDone ? CHECK : hasPercent ? PERCENT : 0
  if (asker) {
    const avail = around(0, 0) - BAR_MIN - PILL_WIDTH - gap
    pillText = !isNarrow && widthOf(full, { isBold: true }) <= avail ? full : widthOf(short, { isBold: true }) <= avail ? short : fit(short, Math.max(0, avail), { isBold: true })
    leadWidth = PILL_WIDTH + widthOf(pillText, { isBold: true })
  }
  const countsWidth = countsWidthOf(parts)
  const showCounts = !isTiny && parts.length > 0 && around(leadWidth, countsWidth) >= BAR_MIN
  const barWidth = Math.max(BAR_MIN, Math.round(around(leadWidth, showCounts ? countsWidth : 0)))
  return { units, asker, isAllDone, isRunning, hasPercent, overall, percent, tone, parts, showCounts, alt, summary, action, actionWidth, padLeft, padRight, gap, barWidth, pillText, now, elapsed, hasElapsed, elapsedWidth }
}

export type BandView = ReturnType<typeof bandViewOf>
