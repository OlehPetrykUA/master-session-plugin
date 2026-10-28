import type { AgentRecord, AgentState, Board, Live, LiveSession, Repo, WorkflowRecord } from '../../types'

import { countsOfItems, itemsOf, listedRowsOf } from './list'
import type { ListItem } from './list'
import { archivedOf, familyOf, rowsOf } from './rows'
import type { Row } from './rows'

export type RunSetInput = {
  board: Board | null
  live: Live
  agents: readonly AgentRecord[]
  workflows: readonly WorkflowRecord[]
  cleared?: number
  at: number
  trees?: readonly Repo[]
}

const isSince = (board: Board | null, when: number | undefined) => board?.since === undefined || when === undefined || when >= board.since

export const rowsInRun = (board: Board | null, live: Live) => {
  const onBoard = new Set(board?.sessions.map(one => one.id))
  return rowsOf(board, live).filter(row => onBoard.has(row.id) || isSince(board, row.live?.createdAt))
}

export function agentsInRun(board: Board | null, agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[]) {
  const isIn = (agent: AgentRecord) => isSince(board, agent.startedAt) || agent.state === 'running' || !!agent.asking
  const runs = new Set(agents.filter(isIn).flatMap(one => (one.run ? [one.run.id] : [])))
  const launched = new Set(agents.flatMap(one => (one.run ? [one.run.id] : [])))
  return { agents: agents.filter(one => (one.run ? runs.has(one.run.id) : isIn(one))), workflows: workflows.filter(one => isSince(board, one.startedAt) || runs.has(one.id) || !launched.has(one.id)) }
}

export function runSetOf({ board, live, agents, workflows, cleared, at, trees }: RunSetInput) {
  const onBoard = new Set(board?.sessions.map(one => one.id))
  const { agents: inAgents, workflows: inWorkflows } = agentsInRun(board, agents, workflows)
  const rows = listedRowsOf(rowsInRun(board, live), inAgents, inWorkflows)
  const archived = archivedOf(live).filter(one => onBoard.has(one.id) || isSince(board, one.createdAt))
  const items = itemsOf(rows, inAgents, inWorkflows, { at, trees, sessions: familyOf(live), cleared, self: live.self })
  return { since: board?.since ?? at, rows, agents: inAgents, workflows: inWorkflows, archived, items }
}

export type RunSummaryInput = {
  rows: readonly Row[]
  sessions: readonly LiveSession[]
  agents: readonly AgentRecord[]
  workflows: readonly WorkflowRecord[]
  board: Board | null
  trees: readonly Repo[]
  at: number
  cleared?: number
  items?: readonly ListItem[]
}

export type RunSummary = ReturnType<typeof runSummaryOf>

export const countOf = (label: string) => /(\d+)\s+(?:tests?\s+)?pass(?:ed|es)?\b/i.exec(label)?.[1]

export const isFailed = (label: string) => /\b[1-9]\d* (?:fail(?:ed|s|ing|ures?)?|errors?)\b|· fail(?:ed|s|ing)?\b|exit [1-9]/i.test(label)

export function commandOf(label: string) {
  const [head = ''] = label.replace(/\s+/g, ' ').trim().split(' · ')
  const words = head.split(' ')
  const cut = words.findIndex((word, index) => index > 0 && (word.startsWith('-') || word === '.' || word.includes('/') || word.includes('=')))
  return (cut > 0 ? words.slice(0, cut) : words).join(' ')
}

const latestOf = (row: Row) => [...new Map((row.board?.tests ?? []).map(label => [commandOf(label), label])).values()]

const failingOf = (rows: readonly Row[]) => rows.flatMap(latestOf).filter(isFailed).reduce((sum, label) => sum + Number(/\b([1-9]\d*) (?:fail(?:ed|s|ing|ures?)?|errors?)\b/i.exec(label)?.[1] ?? 1), 0)

export type Tests = { value: string; sub: string; shorts?: string[]; failing: number }

export function testsOf(rows: readonly Row[], board: Board | null): Tests {
  const failing = failingOf(rows)
  if (board?.testsPassed !== undefined) return { value: String(board.testsPassed), sub: board.testsNote || 'passed', shorts: ['passed'], failing }
  const latest = rows.map(row => latestOf(row).filter(label => !isFailed(label)))
  const counted = latest.map(labels => labels.flatMap(label => (countOf(label) ? [Number(countOf(label))] : [])))
  const sessions = counted.filter(counts => counts.length).length
  if (sessions) return { value: String(counted.flat().reduce((sum, count) => sum + count, 0)), sub: `from ${sessions} QA ${sessions === 1 ? 'pass' : 'passes'}`, shorts: [`${sessions} ${sessions === 1 ? 'pass' : 'passes'}`], failing }
  const checks = latest.flat().length
  if (checks) return { value: `${checks} ${checks === 1 ? 'check' : 'checks'}`, sub: 'passed · no counts', shorts: ['passed'], failing }
  return { value: '—', sub: 'none reported', shorts: ['none'], failing }
}

const sameTree = (known: string, path: string) => (known.startsWith('~/') ? path.endsWith(known.slice(1)) : known === path)

export function runSummaryOf({ rows, sessions, agents, workflows, board, trees, at, cleared, items }: RunSummaryInput) {
  const listed = items ?? itemsOf(rows, agents, workflows, { at, trees, sessions, cleared })
  const counts = countsOfItems(listed, 0)
  const members = listed.flatMap((item): { state: AgentState; tokens?: number }[] => (item.kind === 'subagent' ? [item.agent] : item.kind === 'workflow' ? item.run.agents : []))
  const count = (state: 'running' | 'done' | 'failed') => members.filter(one => one.state === state).length
  const pieces = (board?.plan ?? []).filter(one => one.state !== 'dropped')
  const piece = (state: string) => pieces.filter(one => one.state === state).length
  const known = rows.flatMap(row => [row.board?.cwd, row.live?.cwd, ...(row.board?.worktrees ?? [])]).filter((path): path is string => !!path)
  const all = trees.flatMap(repo => repo.worktrees)
  const isLive = (tree: Repo['worktrees'][number]) => tree.isMain || known.some(path => sameTree(path, tree.path) || tree.path === path)
  const dirty = all.filter(tree => tree.dirty > 0)
  const live = dirty.filter(isLive)
  const stale = dirty.filter(tree => !isLive(tree))
  const since = board?.since ?? at
  return {
    plan: { total: pieces.length, done: piece('done'), working: piece('working'), verifying: piece('verifying'), queued: piece('queued'), sessions: listed.filter(item => item.kind === 'session').length },
    needsYou: counts['needs-you'],
    agents: { total: members.length, working: count('running'), done: count('done'), failed: count('failed') },
    tokens: members.reduce((sum, one) => sum + (one.tokens ?? 0), 0),
    commits: { total: Math.max(rows.reduce((sum, row) => sum + (row.board?.commits?.length ?? 0), 0), trees.reduce((sum, repo) => sum + (repo.landed ?? 0), 0)), repos: trees.length },
    tests: testsOf(rows, board),
    duration: { since, ms: at - since },
    git: { dirty: live.reduce((sum, tree) => sum + tree.dirty, 0), trees: live.length, stale: { files: stale.reduce((sum, tree) => sum + tree.dirty, 0), trees: stale.length } },
  }
}
