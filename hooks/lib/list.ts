import type { AgentRecord, ArchiveView, Filter, LiveSession, SessionState, WorkflowRecord } from '../../types'

import { subagentsOf, workflowRunsOf } from './agents'
import type { WorkflowRun } from './agents'
import { stepOf } from './board'
import { compactOf } from './format'
import type { RunSummary } from './totals'
import { elapsedOf, titleOf } from './rows'
import type { Row } from './rows'

export type ListItem =
  | { kind: 'session'; id: string; group: SessionState; row: Row }
  | { kind: 'workflow'; id: string; group: SessionState; run: WorkflowRun }
  | { kind: 'subagent'; id: string; group: SessionState; agent: AgentRecord }

export type ListGroup = { id: SessionState | 'archived'; items: readonly ListItem[]; archived: readonly LiveSession[]; isPinned: boolean; isOpen: boolean }

export type RowText = { title: string; kind: string; line: string; isAlert: boolean; elapsed: string; step?: { done: number; total: number } }

export const GROUPS: readonly SessionState[] = ['needs-you', 'working', 'waiting', 'done']

export const GROUP_LABEL: Record<SessionState | 'archived', string> = { 'needs-you': 'Needs you', working: 'Working', waiting: 'Waiting', done: 'Done', archived: 'Archived' }

export const ARCHIVED_PEEK = 2

const KIND_ORDER = { session: 0, workflow: 1, subagent: 2 }

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const agentGroup = (state: AgentRecord['state']): SessionState => (state === 'running' ? 'working' : 'done')

export function itemsOf(rows: readonly Row[], agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[]): ListItem[] {
  const sessions = rows.map((row): ListItem => ({ kind: 'session', id: row.id, group: row.state, row }))
  const runs = workflowRunsOf(agents, workflows).map((run): ListItem => ({ kind: 'workflow', id: run.id, group: agentGroup(run.state), run }))
  const helpers = subagentsOf(agents).map((agent): ListItem => ({ kind: 'subagent', id: agent.id, group: agentGroup(agent.state), agent }))
  return [...sessions, ...runs, ...helpers].sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind])
}

export function countsOfItems(items: readonly ListItem[], archived: number): Record<Filter, number> {
  const count = (group: SessionState) => items.filter(item => item.group === group).length
  return { all: items.length, 'needs-you': count('needs-you'), working: count('working'), waiting: count('waiting'), done: count('done'), archived }
}

export function groupsOf(items: readonly ListItem[], archived: readonly LiveSession[], chosen: Filter, archiveView: ArchiveView): ListGroup[] {
  const groupOf = (id: SessionState, isPinned = false): ListGroup => ({ id, items: items.filter(item => item.group === id), archived: [], isPinned, isOpen: true })
  const needs = items.some(item => item.group === 'needs-you') ? [groupOf('needs-you', chosen !== 'all' && chosen !== 'needs-you')] : []
  const archive = (isOpen: boolean): ListGroup => ({ id: 'archived', items: [], archived, isPinned: false, isOpen })
  if (chosen === 'archived') return [...needs, archive(true)]
  if (chosen !== 'all') return chosen === 'needs-you' ? [groupOf('needs-you')] : [...needs, groupOf(chosen)]
  const rest = GROUPS.filter(id => id !== 'needs-you')
    .map(id => groupOf(id))
    .filter(group => group.items.length)
  return [...needs, ...rest, ...(archived.length ? [archive(archiveView !== 'closed')] : [])]
}

export const shownArchived = (group: ListGroup, archiveView: ArchiveView, chosen: Filter) =>
  chosen === 'archived' || archiveView === 'all' ? group.archived : group.archived.slice(0, ARCHIVED_PEEK)

export const kindOfType = (type: string) => type.split(':').at(-1) ?? type

export const modelFamilyOf = (model: string | undefined) => (model ? (model.replace(/^claude-/, '').split('-')[0] ?? model) : '')

const sessionLine = (row: Row) => {
  if (row.state === 'needs-you') return row.board?.needsYou || 'needs you'
  if (row.board?.note) return row.board.note
  const step = stepOf(row.board?.progress)?.label
  if (row.state === 'done') return row.board?.done || step || 'done'
  return step || row.board?.now || (row.live?.isRunning ? 'running' : 'idle')
}

const runLine = (run: WorkflowRun) => {
  const current = [...run.agents].reverse().find(agent => agent.state === 'running')?.label
  const lead = current ?? (run.state === 'running' ? run.description || 'starting' : run.phases.length ? plural(run.phases.length, 'phase') : run.description || run.state)
  return [lead, run.counts.failed ? `${run.counts.failed} failed` : ''].filter(Boolean).join(' · ')
}

const spanText = (startedAt: number, endedAt: number | undefined, at: number) => compactOf((endedAt ?? at) - startedAt)

export function rowTextOf(item: ListItem, at: number): RowText {
  if (item.kind === 'session') {
    const step = stepOf(item.row.board?.progress)
    return { title: titleOf(item.row), kind: 'Session', line: sessionLine(item.row), isAlert: item.group === 'needs-you', elapsed: elapsedOf(item.row, at), step: step ? { done: step.done, total: step.total } : undefined }
  }
  if (item.kind === 'workflow') {
    const { run } = item
    return { title: run.name, kind: 'Workflow', line: runLine(run), isAlert: run.counts.failed > 0, elapsed: spanText(run.startedAt, run.endedAt, at), step: { done: run.counts.done, total: run.counts.total } }
  }
  const { agent } = item
  return { title: agent.name || agent.description, kind: kindOfType(agent.type), line: modelFamilyOf(agent.requestedModel || agent.model), isAlert: false, elapsed: spanText(agent.startedAt, agent.endedAt, at) }
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

export type Block = { key: string; label: string; value: string; sub: string; dots?: readonly { tone: 'green' | 'amber' | 'grey'; count: number }[]; isAlert: boolean }

export function blocksOf(totals: RunSummary, hasWork: boolean, end?: string): Block[] {
  const { sessions, subagents, workflows, commits, tests, duration, git } = totals
  const needs = totals.needsYou
  return [
    { key: 'sessions', label: 'Sessions', value: String(sessions.total), sub: '', dots: [{ tone: 'green', count: sessions.working }, { tone: 'amber', count: sessions.waiting }, { tone: 'grey', count: sessions.done }], isAlert: false },
    { key: 'needs-you', label: 'Needs you', value: String(needs), sub: needs ? plural(needs, 'blocker') : 'nothing waiting', isAlert: needs > 0 },
    { key: 'subagents', label: 'Subagents', value: String(subagents.total), sub: subagents.running ? `${subagents.running} running` : subagents.total ? 'all finished' : 'none', isAlert: false },
    { key: 'workflows', label: 'Workflows', value: String(workflows.total), sub: workflows.total ? `${workflows.agentsDone}/${workflows.agents} agents` : 'none', isAlert: false },
    { key: 'commits', label: 'Commits', value: String(commits.total), sub: commits.total ? plural(commits.repos, 'repo') : '—', isAlert: false },
    { key: 'tests', label: 'Tests', value: String(tests?.passed ?? 0), sub: tests ? 'passed' : '—', isAlert: false },
    { key: 'duration', label: 'Duration', value: hasWork ? compactOf(duration.ms) : '—', sub: !hasWork ? 'not started' : end ? `${clockOf(duration.since)} – ${end}` : `since ${clockOf(duration.since)}`, isAlert: false },
    { key: 'git', label: 'Git', value: String(git.dirty), sub: git.dirty ? 'to commit' : 'clean', isAlert: false },
  ]
}
