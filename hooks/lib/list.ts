import type { AgentRecord, ArchiveView, Board, BoardSession, Filter, LiveSession, Repo, Running, SessionState, TaskText, Undone, WorkflowRecord } from '../../types'

import { lossLineOf, mergedLineOf } from '../components/detail/losses'
import type { Status } from '../theme/icons'
import { workflowRunsOf } from './agents'
import type { WorkflowAgent, WorkflowRun } from './agents'
import { stepOf } from './board'
import { AGENT_SHOWN_MS } from './constants'
import { compactOf } from './format'
import { textWidth } from './layout'
import type { Face } from './layout'
import { elapsedOf, titleOf } from './rows'
import type { Row } from './rows'
import type { RunSummary } from './totals'

export type ListItem =
  | { kind: 'session'; id: string; group: SessionState; status: Status; row: Row; isOwn?: boolean }
  | { kind: 'workflow'; id: string; group: SessionState; status: Status; run: WorkflowRun }
  | { kind: 'subagent'; id: string; group: SessionState; status: Status; agent: AgentRecord }

export type RowItem =
  | ListItem
  | { kind: 'agent'; id: string; group: SessionState; status: Status; run: WorkflowRun; agent: WorkflowAgent }
  | { kind: 'archived'; id: string; group: SessionState; status: Status; one: LiveSession; board?: BoardSession }

export type ListGroup = { id: SessionState | 'archived'; items: readonly ListItem[]; archived: readonly LiveSession[]; isPinned: boolean; isOpen: boolean }

export type Context = { at: number; trees: readonly Repo[]; sessions: readonly LiveSession[]; agents: readonly AgentRecord[]; rows: readonly Row[]; running?: Readonly<Record<string, Running>>; tasks?: Readonly<Record<string, TaskText>>; self?: string }

export const isStartedBy = (live: LiveSession | undefined, self: string | undefined) => self !== undefined && live?.startedBy === self

export type Name = { persona: string; task: string }

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

export const listedRowsOf = (rows: readonly Row[], agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[]) => {
  const taken = agentIdsOf(agents, workflows)
  return rows.filter(row => !taken.has(row.id))
}

export const isGhostRun = (run: WorkflowRun, at: number | undefined) => at !== undefined && !run.agents.length && at - run.startedAt >= AGENT_SHOWN_MS

const finishOf = (item: ListItem) => (item.kind === 'subagent' ? (item.agent.endedAt ?? 0) : item.kind === 'workflow' ? (item.run.endedAt ?? 0) : (item.row.live?.lastActivityAt ?? 0))

export function itemsOf(rows: readonly Row[], agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[], context: Partial<Pick<Context, 'at' | 'trees' | 'sessions'>> & { cleared?: number; self?: string } = {}): ListItem[] {
  const isCleared = (at: number | undefined) => at !== undefined && at <= (context.cleared ?? 0)
  const stale = new Set(workflowRunsOf(agents, workflows).filter(one => isGhostRun(one, context.at) || (one.state !== 'running' && isCleared(one.endedAt))).map(one => one.id))
  const shown = agents.filter(agent => (agent.run ? !stale.has(agent.run.id) : !isCleared(agent.endedAt)))
  const runs = workflows.filter(one => !stale.has(one.id))
  const session = (row: Row): ListItem => {
    const status = sessionStatusOf(row, context.trees, context.sessions)
    return { kind: 'session', id: row.id, group: GROUP_OF[status], status, row, isOwn: isStartedBy(row.live, context.self) }
  }
  const run = (one: WorkflowRun): ListItem => {
    const status = runStatusOf(one)
    return { kind: 'workflow', id: one.id, group: GROUP_OF[status], status, run: one }
  }
  const helper = (agent: AgentRecord): ListItem => {
    const status = agentStatusOf(agent, shown)
    return { kind: 'subagent', id: agent.id, group: GROUP_OF[status], status, agent }
  }
  const flights = workflowRunsOf(shown, runs)
  return [...listedRowsOf(rows, agents, workflows).map(session), ...flights.map(run), ...shown.filter(agent => !agent.run).map(helper)].sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind])
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
  const newestFirst = (left: ListItem, right: ListItem) => finishOf(right) - finishOf(left) || KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
  const groupOf = (id: SessionState, isPinned = false): ListGroup => ({ id, items: id === 'done' ? items.filter(item => item.group === id).sort(newestFirst) : items.filter(item => item.group === id), archived: [], isPinned, isOpen: true })
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

export const chatTargetOf = (item: RowItem): Row | undefined => (item.status === 'needs' && item.kind === 'session' && item.isOwn ? item.row : undefined)

export function spanOf(startedAt: number, endedAt: number | undefined, at: number) {
  const ms = (endedAt ?? at) - startedAt
  return ms < 60_000 ? `${Math.max(0, Math.floor(ms / 1000))}s` : compactOf(ms)
}

export const runningTextOf = (run: Running) => [run.tool, run.text].filter(Boolean).join(' · ')

export const openIdOf = (item: RowItem, open: readonly string[]) =>
  open.includes(item.id) ? item.id : item.kind === 'workflow' ? item.run.agents.find(agent => open.includes(agent.id))?.id : undefined

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

export type Block = {
  key: string
  label: string
  value: string
  sub: string
  shorts?: readonly string[]
  bad?: string
  chats?: number
  dots?: readonly { tone: 'red' | 'green' | 'amber' | 'grey'; count: number }[]
  isAlert: boolean
}

export const tokensText = (count: number) => (count < 1_000 ? String(count) : count < 1_000_000 ? `${Math.round(count / 1_000)}k` : `${String(Math.round(count / 100_000) / 10)}M`)

export const shownDots = (block: Block) => (block.dots ?? []).filter(mark => mark.count > 0)

export function blocksOf(totals: RunSummary, hasWork: boolean, end?: string): Block[] {
  const { plan, needsYou: needs, agents, tokens, commits, tests, duration, git } = totals
  const since = clockOf(duration.since)
  const isPlanDone = plan.total > 0 && plan.done === plan.total
  const repos = commits.repos > 1 ? ` · ${commits.repos} repos` : ''
  const trees = git.trees > 1 ? `to commit · ${git.trees} trees` : 'to commit'
  const stale = git.stale.files ? `+${git.stale.files} in ${git.stale.trees} stale tree${git.stale.trees === 1 ? '' : 's'}` : ''
  const gitBase = git.dirty ? trees : 'clean'
  const agentParts = [...(agents.working ? [`${agents.working} working`] : []), ...(agents.done ? [`${agents.done} done`] : [])]
  return [
    {
      key: 'plan',
      label: 'Plan',
      value: plan.total ? `${plan.done}/${plan.total}` : '—',
      sub: !plan.total ? 'no plan yet' : isPlanDone ? 'all done' : '',
      shorts: !plan.total ? ['—'] : isPlanDone ? ['done'] : [],
      dots: plan.total && !isPlanDone ? [{ tone: 'green', count: plan.working }, { tone: 'amber', count: plan.verifying }, { tone: 'grey', count: plan.queued }] : undefined,
      chats: plan.sessions,
      isAlert: false,
    },
    {
      key: 'needs-you',
      label: 'Needs you',
      value: String(needs),
      sub: needs ? `${needs} waiting` : 'nothing waiting',
      shorts: needs ? [String(needs)] : ['none'],
      isAlert: needs > 0,
    },
    {
      key: 'agents',
      label: 'Agents',
      value: String(agents.total),
      sub: !agents.total ? 'none yet' : agentParts.join(' · '),
      shorts: !agents.total ? ['none'] : [...agentParts.slice(0, 1), ...(agents.failed || !agentParts.length ? [] : [String(agents.working || agents.done)])],
      bad: agents.failed ? `${agents.failed} failed` : undefined,
      isAlert: false,
    },
    {
      key: 'commits',
      label: 'Commits',
      value: String(commits.total),
      sub: commits.total ? `on main since ${since}${repos}` : 'none yet',
      shorts: commits.total ? [`since ${since}${repos}`, ...(repos ? [`${commits.repos} repos`] : []), `since ${since}`] : ['none'],
      isAlert: false,
    },
    {
      key: 'tests',
      label: 'Tests',
      value: tests.value,
      sub: tests.failing ? '' : tests.sub,
      shorts: tests.failing ? [] : (tests.shorts ?? (tests.value === '—' ? ['none'] : [])),
      bad: tests.failing ? `${tests.failing} failing` : undefined,
      isAlert: false,
    },
    {
      key: 'duration',
      label: 'Duration',
      value: hasWork ? compactOf(duration.ms) : '—',
      sub: !hasWork ? 'not started' : end ? `${since} – ${end}` : `since ${since}`,
      shorts: !hasWork ? ['—'] : end ? [`until ${end}`, end] : [since],
      isAlert: false,
    },
    {
      key: 'git',
      label: 'Git',
      value: String(git.dirty),
      sub: stale ? `${gitBase} · ${stale}` : gitBase,
      shorts: stale ? [stale, `+${git.stale.files} stale`, ...(git.dirty ? ['to commit'] : [])] : git.dirty ? ['to commit'] : [],
      isAlert: false,
    },
    { key: 'tokens', label: 'Tokens', value: tokensText(tokens), sub: 'agents only', isAlert: false },
  ]
}
