import type { AgentRecord, Board, Live, Repo, SessionState, WorkflowRecord } from '../../types'

import { BAR, BUTTON, CHECK, PERCENT, PILL } from '../theme/band'
import { PERSONA_GLYPH } from '../theme/icons'
import type { IconName } from '../theme/icons'
import type { BarTone } from '../theme/strip'
import { workflowRunsOf } from './agents'
import type { WorkflowRun } from './agents'
import { progressOf } from './board'
import type { Progress } from './board'
import { CH, fit, textWidth, widthOf } from './layout'
import { CHAT_LABEL, GROUP_OF, nameText, personaOfType, sessionNameOf, sessionStatusOf } from './list'
import { rowsOf } from './rows'
import type { Row } from './rows'

const DIGIT = 0.64
export const HIT = 'band-hit-'
export const BAR_MIN = 48
const COUNTS_BELOW = 600
const PERCENT_BELOW = 340
export const PILL_WIDTH = 2 + PILL.left + PILL.icon + PILL.gap + PILL.right
const NEEDS = ' needs you'
const SEPARATOR = ' · '

export type BandAction = 'board' | 'chat'

type BandActions = { board: () => void; chat: (id: string, name: string) => void }

export type AgentCounts = { agents: readonly AgentRecord[]; workflows: readonly WorkflowRecord[] }

type Asker = { name: string; short: string; glyph: IconName; parent?: string; reason?: string; since?: number; chat?: { id: string; name: string } }

type UnitKind = 'session' | 'subagent' | 'workflow'

type Unit = { id: string; kind: UnitKind; value: number; isRunning: boolean; isFinished: boolean; group?: SessionState; asker?: Asker }

type CountPart = { text: string; isNumber: boolean }

export const bandAction = (element: string) => {
  const name = element.startsWith(HIT) ? element.slice(HIT.length) : ''
  return name === 'board' || name === 'chat' ? name : undefined
}

export const agentCountsOf = (agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[]): AgentCounts => ({ agents, workflows })

const wordFor = (count: number, word: string) => `${word}${count === 1 ? '' : 's'}`

const clamp = (value: number) => Math.min(1, Math.max(0, value))

const agentAskerOf = (type: string, label: string) => {
  const persona = personaOfType(type)
  const glyph = PERSONA_GLYPH[persona]
  return { name: glyph ? persona : label, short: persona, glyph: glyph ?? ('agent' as const) }
}

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

function subagentUnits(agents: readonly AgentRecord[], place: Place): Unit[] {
  return treeOf(agents).map(({ agent, parent }) => {
    const isRunning = agent.state === 'running'
    return {
      id: agent.id,
      kind: 'subagent',
      value: isRunning ? 0 : 1,
      isRunning,
      isFinished: !isRunning,
      asker: isRunning && agent.asking ? { ...agentAskerOf(agent.type, agent.name || agent.description), parent: parent ? agentAskerOf(parent.type, parent.name || parent.description).name : place.parent, reason: agent.asking.text, since: agent.asking.since, chat: place.chat } : undefined,
    }
  })
}

function runUnits(runs: readonly WorkflowRun[], place: Place): Unit[] {
  return runs.map(run => {
    const asking = run.agents.find(one => one.state === 'running' && one.asking)
    const isRunning = run.state === 'running'
    const finished = run.counts.done + run.counts.failed
    return {
      id: run.id,
      kind: 'workflow',
      value: isRunning ? (run.counts.total ? finished / run.counts.total : 0) : 1,
      isRunning,
      isFinished: !isRunning,
      asker: asking?.asking ? { ...agentAskerOf(asking.type, asking.label), parent: run.name, reason: asking.asking.text, since: asking.asking.since, chat: place.chat } : undefined,
    }
  })
}

const remoteOf = (agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[], id: string, place: Place) => {
  const mine = agents.filter(one => one.parentSessionId === id)
  const runs = runUnits(
    workflowRunsOf(
      mine.map(({ parentSessionId, ...one }) => one),
      workflows.filter(one => one.parentSessionId === id).map(({ parentSessionId, ...one }) => one),
    ),
    { chat: place.chat },
  )
  return { subs: subagentUnits(mine.filter(one => !one.run), place), runs }
}

export function bandUnitsOf(segments: Progress['segments'], current: Board | null, { agents, workflows }: AgentCounts, live?: Live, trees: readonly Repo[] = []): Unit[] {
  const own = agents.filter(one => !one.parentSessionId)
  const units: Unit[] = subagentUnits(
    own.filter(one => !one.run),
    {},
  )
  const known = new Set(segments.map(one => one.id))
  const rows = live ? rowsOf(current, live) : []
  for (const segment of segments) {
    const row = current?.sessions.find(one => one.id === segment.id)
    const name = row?.name ?? segment.id
    const chat = { id: segment.id, name }
    const display = sessionNameOf(live?.sessions.find(one => one.id === segment.id)?.title || row?.title || name, row?.persona)
    const self = { name: nameText(display), short: display.persona, glyph: PERSONA_GLYPH[display.persona] ?? ('session' as const) }
    const { subs, runs } = remoteOf(agents, workflows, segment.id, { parent: display.persona === 'Session' ? display.task : display.persona, chat })
    const found: Row = rows.find(one => one.id === segment.id) || { id: segment.id, name, title: row?.title ?? '', state: segment.state, board: row }
    const group = GROUP_OF[sessionStatusOf(found, trees, live?.sessions ?? [])]
    const isAsking = group === 'needs-you'
    const child = isAsking ? [...subs, ...runs].find(one => one.asker && one.asker.reason === row?.needsYou) : undefined
    const isDone = group === 'done'
    units.push({
      id: segment.id,
      kind: 'session',
      value: isDone ? 1 : clamp(segment.fill),
      isRunning: group === 'working',
      isFinished: isDone,
      group,
      asker: isAsking ? (child?.asker ?? { ...self, reason: row?.needsYou, chat }) : undefined,
    })
    units.push(...subs, ...runs)
  }
  const gone = [...new Set(agents.flatMap(one => (one.parentSessionId && !known.has(one.parentSessionId) ? [one.parentSessionId] : [])))]
  gone.forEach(id => {
    const { subs, runs } = remoteOf(agents, workflows, id, {})
    units.push(...subs, ...runs)
  })
  units.push(...runUnits(workflowRunsOf(agents, workflows), {}))
  return units
}

const firstAskerOf = (units: readonly Unit[]) => units.reduce<Asker | undefined>((first, one) => (one.asker && (!first || (one.asker.since ?? Infinity) < (first.since ?? Infinity)) ? one.asker : first), undefined)

const headOf = (asker: Asker) => (asker.parent ? `${asker.name}, in ${asker.parent},${NEEDS}` : `${asker.name}${NEEDS}`)

export const overallOf = (units: readonly Unit[]) => (units.length ? units.reduce((sum, one) => sum + one.value, 0) / units.length : 0)

export const percentOf = (units: readonly Unit[]) => {
  if (!units.length) return 0
  if (units.every(one => one.isFinished)) return 100
  return Math.min(99, Math.floor(overallOf(units) * 100 + 1e-9))
}

export function countsOf(units: readonly Unit[], isAllDone: boolean): CountPart[] {
  if (isAllDone) return [{ text: 'All ', isNumber: false }, { text: String(units.length), isNumber: true }, { text: ' done', isNumber: false }]
  const sessions = (group: SessionState) => units.filter(one => one.kind === 'session' && one.group === group).length
  const running = (kind: UnitKind) => units.filter(one => one.kind === kind && one.isRunning).length
  const subagents = running('subagent')
  const workflows = running('workflow')
  const entries: [number, string][] = [[sessions('working'), 'working'], [sessions('waiting'), 'waiting']]
  if (subagents) entries.push([subagents, wordFor(subagents, 'subagent')])
  if (workflows) entries.push([workflows, wordFor(workflows, 'workflow')])
  return entries.flatMap(([count, word], index): CountPart[] => [...(index ? [{ text: SEPARATOR, isNumber: false }] : []), { text: String(count), isNumber: true }, { text: ` ${word}`, isNumber: false }])
}

export const countsText = (parts: readonly CountPart[]) => parts.map(one => one.text).join('')

const countsWidthOf = (parts: readonly CountPart[]) => parts.reduce((sum, one) => sum + (one.isNumber ? DIGIT * 13 * one.text.length : textWidth(one.text, 13)), 0)

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

export function bandProgressWith(current: Board | null, live: Live, { agents, workflows }: AgentCounts) {
  const progress = bandProgress(current, live)
  if (progress) return progress
  const isBusy = agents.some(one => one.state === 'running') || workflowRunsOf(agents, workflows).some(run => run.state === 'running')
  return isBusy ? IDLE_PROGRESS : undefined
}

export function bandViewOf(columns: number, current: Board | null, progress: Progress, isPaneOpen: boolean, agents: AgentCounts, act: BandActions, live?: Live, trees: readonly Repo[] = []) {
  const width = columns * CH - 16
  const isNarrow = width < COUNTS_BELOW
  const units = bandUnitsOf(progress.segments, current, agents, live, trees)
  const asker = firstAskerOf(units)
  const isAllDone = !asker && units.length > 0 && units.every(one => one.isFinished)
  const isRunning = units.some(one => one.isRunning)
  const overall = overallOf(units)
  const percent = percentOf(units)
  const tone: BarTone = asker ? 'red' : isAllDone || isRunning ? 'green' : 'grey'
  const hasPercent = !asker && !isAllDone && width >= PERCENT_BELOW
  const parts = asker ? [] : countsOf(units, isAllDone)
  const full = asker ? `${headOf(asker)}${asker.reason ? ` · ${asker.reason}` : ''}` : ''
  const short = asker ? `${asker.short}${NEEDS}` : ''
  const alt = asker
    ? `Master session: ${headOf(asker)}${asker.reason ? `, ${asker.reason}` : ''}`
    : isAllDone
      ? `Master session: all ${units.length} done`
      : `Master session: ${[`${percent} percent`, ...countsText(parts).split(SEPARATOR)].join(', ')}`
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
  const around = (lead: number, counts: number) => {
    const sides = [lead, counts, actionWidth].filter(Boolean)
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
  const showCounts = !isNarrow && parts.length > 0 && around(leadWidth, countsWidth) >= BAR_MIN
  const barWidth = Math.max(BAR_MIN, Math.round(around(leadWidth, showCounts ? countsWidth : 0)))
  return { units, asker, isAllDone, isRunning, hasPercent, overall, percent, tone, parts, showCounts, alt, action, actionWidth, padLeft, padRight, gap, barWidth, pillText }
}

export type BandView = ReturnType<typeof bandViewOf>
