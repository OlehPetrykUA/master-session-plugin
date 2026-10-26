import type { AgentRecord, ArchiveView, Board, BoardSession, Filter, LiveSession, Repo, Running, SessionState, TaskText, Undone, WorkflowRecord } from '../../types'

import { lossLineOf, mergedLineOf } from '../components/detail/losses'
import { STATUS } from '../theme/icons'
import type { Status } from '../theme/icons'
import { workflowRunsOf } from './agents'
import type { WorkflowAgent, WorkflowRun } from './agents'
import { stepOf } from './board'
import { AGENT_SHOWN_MS } from './constants'
import { compactOf } from './format'
import { textWidth } from './layout'
import type { Face } from './layout'
import { activityOf, elapsedOf, titleOf } from './rows'
import type { Row } from './rows'
import type { RunSummary } from './totals'

export type ListItem =
  | { kind: 'session'; id: string; group: SessionState; status: Status; row: Row }
  | { kind: 'workflow'; id: string; group: SessionState; status: Status; run: WorkflowRun }
  | { kind: 'subagent'; id: string; group: SessionState; status: Status; agent: AgentRecord }

export type RowItem =
  | ListItem
  | { kind: 'agent'; id: string; group: SessionState; status: Status; run: WorkflowRun; agent: WorkflowAgent }
  | { kind: 'archived'; id: string; group: SessionState; status: Status; one: LiveSession; board?: BoardSession }

export type ListGroup = { id: SessionState | 'archived'; items: readonly ListItem[]; archived: readonly LiveSession[]; isPinned: boolean; isOpen: boolean }

export type Context = { at: number; trees: readonly Repo[]; sessions: readonly LiveSession[]; agents: readonly AgentRecord[]; rows: readonly Row[]; running?: Readonly<Record<string, Running>>; tasks?: Readonly<Record<string, TaskText>> }

export type Name = { persona: string; task: string }

export type Line = { chain: string; word?: { status: Status; text: string }; text: string; cmdElapsed?: string; isQuestion: boolean }

export const GROUPS: readonly SessionState[] = ['needs-you', 'working', 'waiting', 'done']

export const GROUP_LABEL: Record<SessionState | 'archived', string> = { 'needs-you': 'Needs you', working: 'Working', waiting: 'Waiting', done: 'Done', archived: 'Archived' }

export const ARCHIVED_PEEK = 2

export const CHAT_LABEL = 'Open chat'

const KIND_ORDER = { session: 0, workflow: 1, subagent: 2 }

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export function undoTextOf({ ids, hid, skipped }: Undone) {
  const hidden = hid ? [hid.agents && plural(hid.agents, 'subagent'), hid.runs && plural(hid.runs, 'workflow')].filter(Boolean).join(' and ') : ''
  const text = [ids.length && `archived ${plural(ids.length, 'session')}`, hidden && `hid ${hidden}`, skipped && `skipped ${skipped} with work to keep`].filter(Boolean).join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const GROUP_OF: Record<Status, SessionState> = {
  needs: 'needs-you',
  working: 'working',
  queued: 'working',
  waiting: 'waiting',
  idle: 'waiting',
  ready: 'waiting',
  verified: 'done',
  merged: 'done',
  done: 'done',
  failed: 'done',
  archived: 'done',
  unmerged: 'done',
}

const PERSONA: Record<string, string> = {
  implementer: 'Implementer',
  refactorer: 'Refactorer',
  reviewer: 'Code reviewer',
  'qa-verifier': 'QA verifier',
  'design-checker': 'Design checker',
  researcher: 'Researcher',
  designer: 'Designer',
  architect: 'Architect',
  validator: 'Validator',
}

export const MASTER = 'Validator'

const GENERIC = ['general-purpose', 'workflow-subagent']

export const kindOfType = (type: string) => type.split(':').at(-1) ?? type

export const personaOfType = (type: string) => (GENERIC.includes(kindOfType(type)) ? 'Agent' : (PERSONA[kindOfType(type)] ?? (kindOfType(type) || 'Subagent')))

const firstLine = (text: string | undefined) => (text ?? '').split('\n').find(line => line.trim())?.trim() ?? ''

export function sessionNameOf(title: string, persona: string | undefined): Name {
  const cut = title.indexOf(' · ')
  const prefix = cut > 0 ? title.slice(0, cut) : ''
  return { persona: persona || prefix || 'Session', task: cut > 0 ? title.slice(cut + 3) : title }
}

export function displayNameOf(item: RowItem | { kind: 'master' }): Name {
  if (item.kind === 'master') return { persona: MASTER, task: '' }
  if (item.kind === 'session') return sessionNameOf(titleOf(item.row), item.row.board?.persona)
  if (item.kind === 'archived') return sessionNameOf(item.board?.title || item.one.title || item.one.name, item.board?.persona)
  if (item.kind === 'workflow') return { persona: 'Workflow', task: item.run.name }
  if (item.kind === 'agent') return { persona: personaOfType(item.agent.type), task: item.agent.label }
  return { persona: personaOfType(item.agent.type), task: item.agent.name || item.agent.description }
}

export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

const homeOf = (home: string) => home.replace(/\/+$/, '')

export function relativeOf(path: string, roots: readonly string[], home: string) {
  const root = homeOf(home)
  const full = root && path.startsWith('~/') ? `${root}${path.slice(1)}` : path
  const base = roots
    .map(one => one.replace(/\/+$/, ''))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .find(one => full.startsWith(`${one}/`))
  return base ? full.slice(base.length + 1) : root && full.startsWith(`${root}/`) ? `~${full.slice(root.length)}` : path
}

export function askOf(text: string | undefined) {
  const found = /^Allow ([^:\n]{1,40}):\s*([\s\S]+)$/.exec(text ?? '')
  return found ? { tool: found[1] ?? '', rest: found[2] ?? '' } : undefined
}

export const tildeOf = (text: string, home: string) => (homeOf(home) ? text.split(`${homeOf(home)}/`).join('~/') : text)

const fits = (text: string, room: number, size: number, face: Face) => textWidth(text, size, face) <= room

function fitOf(chars: readonly string[], room: number, size: number, face: Face) {
  let low = 0
  let high = chars.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (fits(`${chars.slice(0, mid).join('')}…`, room, size, face)) low = mid
    else high = mid - 1
  }
  return `${chars.slice(0, low).join('').trimEnd()}…`
}

function headOf(text: string, limit: number) {
  for (let take = limit * 2; ; take *= 2) {
    const flat = oneLine(text.slice(0, take))
    if (take >= text.length || Array.from(flat).length > limit) return flat
  }
}

const WORD = /[\p{L}\p{N}]/u

export function rowsOf(text: string, room: number, size: number, count: number, face: Face = {}): string[] {
  const all = Array.from(headOf(text, Math.ceil((Math.max(0, room) / (0.28 * size)) * count) + 2))
  const rows: string[] = []
  let start = 0
  while (start < all.length && rows.length < count) {
    let width = 0
    let end = start
    let space = -1
    let spaceWidth = 0
    let slash = -1
    let hyphen = -1
    let token = start ? all.lastIndexOf(' ', start - 1) + 1 : 0
    while (end < all.length) {
      const next = width + textWidth(all[end] ?? '', size, face)
      if (next > room) break
      width = next
      const ch = all[end]
      if (ch === ' ') {
        space = end
        spaceWidth = width
        token = end + 1
      } else if (ch === '/') slash = end + 1
      else if (ch === '-' && !face.isMono && WORD.test(all[end - 1] ?? '') && WORD.test(all[end + 1] ?? '') && all[token] !== '-' && !all.slice(token, end).includes('/')) hyphen = end + 1
      end += 1
    }
    if (end >= all.length) {
      rows.push(all.slice(start).join(''))
      break
    }
    if (rows.length === count - 1) {
      rows.push(fitOf(all.slice(start, end + 1), room, size, face))
      break
    }
    const isShort = slash > space && spaceWidth < room / 2
    const cut = space > start && !isShort ? space : slash > start ? slash : hyphen > start ? hyphen : Math.max(end, start + 1)
    rows.push(all.slice(start, cut).join('').trimEnd())
    start = all[cut] === ' ' ? cut + 1 : cut
  }
  return rows
}

export function foldPath(path: string, room: number, size = 12) {
  const parts = path.split('/')
  if (parts.length < 3 || fits(path, room, size, { isMono: true })) return path
  for (let keep = parts.length - 2; keep >= 1; keep -= 1) {
    const folded = [parts[0], '…', ...parts.slice(parts.length - keep)].join('/')
    if (fits(folded, room, size, { isMono: true })) return folded
  }
  return [parts[0], '…', parts.at(-1)].join('/')
}

export const nameText = (name: Name) => (name.task ? `${name.persona} · ${name.task}` : name.persona)

export function sessionStatusOf(row: Row, trees: readonly Repo[] = [], sessions: readonly LiveSession[] = []): Status {
  if (row.state === 'needs-you') return 'needs'
  const isRunning = row.live?.isRunning
  if (row.state === 'working') return isRunning === false ? 'idle' : 'working'
  if (row.state === 'waiting') return !isRunning && (!row.board?.now || /^idle\b/i.test(row.board.now)) ? 'idle' : 'waiting'
  if (mergedLineOf(row, trees) && !lossLineOf(row, trees, sessions)) return 'merged'
  if (row.board?.verified) return 'verified'
  if (row.board?.sha) return 'ready'
  return 'done'
}

const hasRunningChild = (agent: { id: string }, agents: readonly AgentRecord[]) => agents.some(one => one.parentAgentId === agent.id && one.state === 'running')

export function agentStatusOf(agent: AgentRecord | WorkflowAgent, agents: readonly AgentRecord[] = []): Status {
  if (agent.state === 'running' && agent.asking) return 'needs'
  if (agent.state === 'running') return 'id' in agent && hasRunningChild(agent, agents) ? 'waiting' : 'working'
  return agent.state === 'failed' ? 'failed' : 'done'
}

export function runStatusOf(run: WorkflowRun): Status {
  if (run.counts.asking || run.agents.some(agent => agent.asking && agent.state === 'running')) return 'needs'
  if (run.state === 'running') return 'working'
  return run.state === 'failed' ? 'failed' : 'done'
}

export const agentIdsOf = (agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[]) => new Set([...agents.flatMap(agent => [agent.id, ...(agent.run ? [agent.run.id] : [])]), ...workflows.map(one => one.id)])

export const isGhostRun = (run: WorkflowRun, at: number | undefined) => at !== undefined && !run.agents.length && at - run.startedAt >= AGENT_SHOWN_MS

export function itemsOf(rows: readonly Row[], agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[], context: Partial<Pick<Context, 'at' | 'trees' | 'sessions'>> & { cleared?: number } = {}): ListItem[] {
  const isOld = (at: number | undefined) => context.at !== undefined && at !== undefined && context.at - at >= AGENT_SHOWN_MS
  const isCleared = (at: number | undefined) => at !== undefined && at <= (context.cleared ?? 0)
  const stale = new Set(workflowRunsOf(agents, workflows).filter(one => isGhostRun(one, context.at) || (one.state !== 'running' && (isOld(one.endedAt) || isCleared(one.endedAt)))).map(one => one.id))
  const shown = agents.filter(agent => (agent.run ? !stale.has(agent.run.id) : !isOld(agent.endedAt) && !isCleared(agent.endedAt)))
  const runs = workflows.filter(one => !stale.has(one.id))
  const session = (row: Row): ListItem => {
    const status = sessionStatusOf(row, context.trees, context.sessions)
    return { kind: 'session', id: row.id, group: GROUP_OF[status], status, row }
  }
  const run = (one: WorkflowRun): ListItem => {
    const status = runStatusOf(one)
    return { kind: 'workflow', id: one.id, group: GROUP_OF[status], status, run: one }
  }
  const helper = (agent: AgentRecord): ListItem => {
    const status = agentStatusOf(agent, shown)
    return { kind: 'subagent', id: agent.id, group: GROUP_OF[status], status, agent }
  }
  const taken = agentIdsOf(agents, workflows)
  const flights = workflowRunsOf(shown, runs)
  return [...rows.filter(row => !taken.has(row.id)).map(session), ...flights.map(run), ...shown.filter(agent => !agent.run).map(helper)].sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind])
}

export function runAgentsOf(run: WorkflowRun, agents: readonly AgentRecord[] = []): RowItem[] {
  return run.agents.map(agent => {
    const status = agentStatusOf(agent, agents)
    return { kind: 'agent', id: agent.id, group: GROUP_OF[status], status, run, agent }
  })
}

export const archivedItemOf = (one: LiveSession, board?: Board | null): Extract<RowItem, { kind: 'archived' }> => ({ kind: 'archived', id: one.id, group: 'done', status: 'archived', one, board: board?.sessions.find(entry => entry.id === one.id) })

export function countsOfItems(items: readonly ListItem[], archived: number): Record<Filter, number> {
  const count = (group: SessionState) => items.filter(item => item.group === group).length
  return { all: items.length, 'needs-you': count('needs-you'), working: count('working'), waiting: count('waiting'), done: count('done'), archived }
}

export function groupsOf(items: readonly ListItem[], archived: readonly LiveSession[], chosen: Filter, archiveView: ArchiveView, kept?: SessionState): ListGroup[] {
  const groupOf = (id: SessionState, isPinned = false): ListGroup => ({ id, items: items.filter(item => item.group === id), archived: [], isPinned, isOpen: true })
  const needs = items.some(item => item.group === 'needs-you') ? [groupOf('needs-you', chosen !== 'all' && chosen !== 'needs-you')] : []
  const archive = (isOpen: boolean): ListGroup => ({ id: 'archived', items: [], archived, isPinned: false, isOpen })
  if (chosen === 'archived') return [...needs, archive(true)]
  if (chosen !== 'all') return chosen === 'needs-you' ? [groupOf('needs-you')] : [...needs, groupOf(chosen)]
  const rest = GROUPS.filter(id => id !== 'needs-you')
    .map(id => groupOf(id))
    .filter(group => group.items.length || group.id === kept)
  return [...needs, ...rest, ...(archived.length ? [archive(archiveView !== 'closed')] : [])]
}

export const shownArchived = (group: ListGroup, archiveView: ArchiveView, chosen: Filter) =>
  chosen === 'archived' || archiveView === 'all' ? group.archived : group.archived.slice(0, ARCHIVED_PEEK)

const sessionOfId = (id: string | undefined, context: Context) => context.rows.find(row => row.id === id)

export function parentsOf(item: RowItem, context: Context): Name[] {
  if (item.kind === 'agent') return [{ persona: 'Workflow', task: item.run.name }]
  if (item.kind !== 'subagent') return []
  const names: Name[] = []
  let agent: AgentRecord | undefined = item.agent
  const seen = new Set<string>()
  while (agent && !seen.has(agent.id)) {
    seen.add(agent.id)
    const parent: AgentRecord | undefined = agent.parentAgentId ? context.agents.find(one => one.id === agent?.parentAgentId) : undefined
    if (parent) {
      names.unshift(displayNameOf({ kind: 'subagent', id: parent.id, group: 'working', status: 'working', agent: parent }))
      agent = parent
      continue
    }
    const row = sessionOfId(agent.parentSessionId, context)
    names.unshift(row ? displayNameOf({ kind: 'session', id: row.id, group: row.state, status: 'working', row }) : { persona: MASTER, task: '' })
    agent = undefined
  }
  return names
}

export function sessionOfAgent(agent: AgentRecord, context: Pick<Context, 'agents' | 'rows'>): Row | undefined {
  const seen = new Set<string>()
  let one: AgentRecord | undefined = agent
  while (one && !seen.has(one.id)) {
    seen.add(one.id)
    if (one.parentSessionId) return context.rows.find(row => row.id === one?.parentSessionId)
    const parentId: string | undefined = one.parentAgentId
    one = parentId ? context.agents.find(other => other.id === parentId) : undefined
  }
  return undefined
}

export const chatTargetOf = (item: RowItem): Row | undefined => (item.status === 'needs' && item.kind === 'session' ? item.row : undefined)

export function chainOf(item: RowItem, context: Context) {
  if (item.kind !== 'subagent') return ''
  const names = parentsOf(item, context)
  const last = names.at(-1)
  return last ? `${names.length > 1 ? '… › ' : ''}${last.persona} ›` : ''
}

export function spanOf(startedAt: number, endedAt: number | undefined, at: number) {
  const ms = (endedAt ?? at) - startedAt
  return ms < 60_000 ? `${Math.max(0, Math.floor(ms / 1000))}s` : compactOf(ms)
}

export const runningOfItem = (item: RowItem, context: Pick<Context, 'running'>) =>
  item.status === 'working' && (item.kind === 'session' || item.kind === 'subagent' || item.kind === 'agent') ? context.running?.[item.id] : undefined

export const runningTextOf = (run: Running) => [run.tool, run.text].filter(Boolean).join(' · ')

const commandOf = (run: Running | undefined, chain: string, at: number): Line | undefined =>
  run ? { chain, text: runningTextOf(run), cmdElapsed: spanOf(run.since, undefined, at), isQuestion: false } : undefined

function sessionLineOf(row: Row, status: Status, context: Context, run?: Running): Line {
  const board = row.board
  const loss = status === 'done' ? lossLineOf(row, context.trees, context.sessions) : ''
  const plain = (text: string): Line => ({ chain: '', text, isQuestion: false })
  const worded = (word: Status, text: string, label = STATUS[word].word): Line => ({ chain: '', word: { status: word, text: label }, text, isQuestion: false })
  if (status === 'needs') return { chain: '', text: board?.needsYou || 'needs you', isQuestion: true }
  if (loss) return worded('unmerged', loss)
  if (status === 'working') return commandOf(run, '', context.at) ?? plain(stepOf(board?.progress)?.label || board?.now || 'running')
  if (status === 'idle') return worded('idle', activityOf(row)[0] ? `last: ${activityOf(row)[0]?.text}` : '')
  if (status === 'waiting') return worded('waiting', board?.now ?? '')
  if (status === 'ready') return worded('ready', board?.done || board?.now || board?.sha || '')
  if (status === 'verified') return worded('verified', board?.verified ?? '')
  if (status === 'merged') return worded('merged', board?.sha ?? '', mergedLineOf(row, context.trees))
  return worded('done', board?.done || 'unverified')
}

function agentLineOf(agent: AgentRecord | WorkflowAgent, status: Status, chain: string, context: Context, run?: Running): Line {
  const result = firstLine(agent.result)
  if (status === 'needs') return { chain, text: agent.asking?.text || 'needs you', isQuestion: true }
  if (status === 'waiting') {
    const child = context.agents.find(one => one.parentAgentId === agent.id && one.state === 'running')
    const name = child ? displayNameOf({ kind: 'subagent', id: child.id, group: 'working', status: 'working', agent: child }) : undefined
    return { chain, word: { status, text: STATUS.waiting.word }, text: name ? `on ${nameText(name)}` : '', isQuestion: false }
  }
  if (status === 'working') return commandOf(run, chain, context.at) ?? { chain, text: 'running', isQuestion: false }
  return { chain, word: { status, text: STATUS[status].word }, text: result, isQuestion: false }
}

function runLineOf(run: WorkflowRun, status: Status): Line {
  if (status === 'needs') {
    const asking = run.agents.find(agent => agent.asking && agent.state === 'running')
    const persona = asking ? displayNameOf({ kind: 'agent', id: asking.id, group: 'needs-you', status: 'needs', run, agent: asking }).persona : 'An agent'
    return { chain: '', text: `${persona} asks: ${asking?.asking?.text ?? ''}`, isQuestion: true }
  }
  if (status === 'working') return { chain: '', text: [...run.agents].reverse().find(agent => agent.state === 'running')?.label ?? (run.description || 'starting'), isQuestion: false }
  if (status === 'failed') return { chain: '', word: { status, text: STATUS.failed.word }, text: `${plural(run.counts.failed, 'agent')} failed`, isQuestion: false }
  return { chain: '', word: { status, text: STATUS.done.word }, text: `${run.counts.done} of ${run.counts.total} agents`, isQuestion: false }
}

export function lineOf(item: RowItem, context: Context): Line {
  const run = runningOfItem(item, context)
  if (item.kind === 'session') return sessionLineOf(item.row, item.status, context, run)
  if (item.kind === 'workflow') return runLineOf(item.run, item.status)
  if (item.kind === 'archived') return { chain: '', word: { status: 'archived', text: `archived ${ageOf(context.at - item.one.lastActivityAt)}` }, text: '', isQuestion: false }
  return agentLineOf(item.agent, item.status, chainOf(item, context), context, run)
}

export const openIdOf = (item: RowItem, open: readonly string[]) =>
  open.includes(item.id) ? item.id : item.kind === 'workflow' ? item.run.agents.find(agent => open.includes(agent.id))?.id : undefined

export const lineTextOf = (line: Line) => oneLine(`${line.chain ? `${line.chain} ` : ''}${[line.word?.text, line.text, line.cmdElapsed].filter(Boolean).join(' · ')}`)

export const shortNameOf = (item: RowItem) => {
  const name = displayNameOf(item)
  return name.task || name.persona
}

export function elapsedOfItem(item: RowItem, at: number) {
  if (item.kind === 'session') return elapsedOf(item.row, at)
  if (item.kind === 'workflow') return spanOf(item.run.startedAt, item.run.endedAt, at)
  if (item.kind === 'archived') return item.one.createdAt === undefined ? '' : spanOf(item.one.createdAt, item.one.lastActivityAt, at)
  return spanOf(item.agent.startedAt, item.agent.endedAt, at)
}

export function stepsOfItem(item: RowItem) {
  if (item.kind === 'session') {
    const step = stepOf(item.row.board?.progress)
    return step ? { done: step.done, total: step.total } : undefined
  }
  if (item.kind === 'workflow') return { done: item.run.counts.done, total: item.run.counts.total }
  return undefined
}

export function ageOf(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1_440)}d ago`
}

export const clockOf = (ms: number) => {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export const isAllDone = (items: readonly ListItem[]) => items.length > 0 && items.every(item => item.group === 'done')

export const EMPTY_TEXT: Record<Filter, { title: string; body: string }> = {
  all: { title: 'No worker sessions yet', body: 'Start one with /master-session:start and a task.' },
  'needs-you': { title: 'Nothing needs you', body: 'No session is blocked on your answer.' },
  working: { title: 'Nothing working', body: 'No session, workflow or subagent is running.' },
  waiting: { title: 'Nothing waiting', body: 'No session is waiting on a review or an answer.' },
  done: { title: 'Nothing done yet', body: 'Finished sessions, workflows and subagents land here.' },
  archived: { title: 'Nothing archived yet', body: 'Archived sessions land here.' },
}

export type Block = { key: string; label: string; value: string; sub: string; shorts?: readonly string[]; dots?: readonly { tone: 'red' | 'green' | 'amber' | 'grey'; count: number }[]; isAlert: boolean }

export const shownDots = (block: Block) => (block.dots ?? []).filter(mark => mark.count > 0)

export function blocksOf(totals: RunSummary, hasWork: boolean, end?: string): Block[] {
  const { sessions, subagents, workflows, commits, tests, duration, git } = totals
  const needs = totals.needsYou.sessions + totals.needsYou.subagents
  const since = clockOf(duration.since)
  return [
    { key: 'sessions', label: 'Sessions', value: String(sessions.total), sub: '', dots: [{ tone: 'red', count: totals.needsYou.sessions }, { tone: 'green', count: sessions.working }, { tone: 'amber', count: sessions.waiting }, { tone: 'grey', count: sessions.done }], isAlert: false },
    {
      key: 'needs-you',
      label: 'Needs you',
      value: String(needs),
      sub: needs ? [totals.needsYou.sessions ? plural(totals.needsYou.sessions, 'session') : '', totals.needsYou.subagents ? plural(totals.needsYou.subagents, 'subagent') : ''].filter(Boolean).join(' · ') : 'nothing waiting',
      shorts: needs ? [plural(needs, 'blocker'), String(needs)] : ['none'],
      isAlert: needs > 0,
    },
    { key: 'subagents', label: 'Subagents', value: String(subagents.total), sub: subagents.running ? `${subagents.running} running` : subagents.total ? 'all finished' : 'none', shorts: subagents.running ? [String(subagents.running)] : subagents.total ? ['done'] : [], isAlert: false },
    { key: 'workflows', label: 'Workflows', value: String(workflows.total), sub: workflows.total ? `${workflows.agentsDone}/${workflows.agents} agents` : 'none', shorts: workflows.total ? [`${workflows.agentsDone}/${workflows.agents}`] : [], isAlert: false },
    { key: 'commits', label: 'Commits', value: String(commits.total), sub: commits.total ? plural(commits.repos, 'repo') : '—', shorts: commits.total ? [String(commits.repos)] : [], isAlert: false },
    { key: 'tests', label: 'Tests', value: tests.value, sub: tests.sub, shorts: /^\d+$/.test(tests.value) ? [`${tests.value} passed`, tests.value] : tests.value === '—' ? ['none'] : [tests.value], isAlert: false },
    {
      key: 'duration',
      label: 'Duration',
      value: hasWork ? compactOf(duration.ms) : '—',
      sub: !hasWork ? 'not started' : end ? `${since} – ${end}` : `since ${since}`,
      shorts: !hasWork ? ['—'] : end ? [`until ${end}`, end] : [since],
      isAlert: false,
    },
    { key: 'git', label: 'Git', value: String(git.dirty), sub: git.dirty ? 'to commit' : 'clean', shorts: git.dirty ? [String(git.dirty)] : [], isAlert: false },
  ]
}
