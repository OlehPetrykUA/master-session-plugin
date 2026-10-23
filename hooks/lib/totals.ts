import type { AgentRecord, Board, Repo, WorkflowRecord } from '../../types'

import { stateCountsOf, subagentsOf, workflowRunsOf } from './agents'
import type { Counts, Row } from './rows'

export type RunSummaryInput = {
  rows: readonly Row[]
  counts: Counts
  archived: number
  agents: readonly AgentRecord[]
  workflows: readonly WorkflowRecord[]
  board: Board | null
  trees: readonly Repo[]
  at: number
}

export type RunSummary = ReturnType<typeof runSummaryOf>

export const countOf = (label: string) => /(\d+)\s+(?:tests?\s+)?pass(?:ed|es)?\b/i.exec(label)?.[1]

export const isFailed = (label: string) => /\b[1-9]\d* (?:fail(?:ed|s|ing)?|errors?)\b|· fail(?:ed|s)?\b|exit [1-9]/i.test(label)

export function commandOf(label: string) {
  const [head = ''] = label.replace(/\s+/g, ' ').trim().split(' · ')
  const words = head.split(' ')
  const cut = words.findIndex((word, index) => index > 0 && (word.startsWith('-') || word === '.' || word.includes('/') || word.includes('=')))
  return (cut > 0 ? words.slice(0, cut) : words).join(' ')
}

export function testsOf(rows: readonly Row[], board: Board | null) {
  if (board?.testsPassed !== undefined) return { value: String(board.testsPassed), sub: board.testsNote || 'passed' }
  const latest = rows.map(row => [...new Map((row.board?.tests ?? []).map(label => [commandOf(label), label])).values()].filter(label => !isFailed(label)))
  const counted = latest.map(labels => labels.flatMap(label => (countOf(label) ? [Number(countOf(label))] : [])))
  const sessions = counted.filter(counts => counts.length).length
  if (sessions) return { value: String(counted.flat().reduce((sum, count) => sum + count, 0)), sub: `from ${sessions} ${sessions === 1 ? 'session’s' : 'sessions’'} checks` }
  const checks = latest.flat().length
  if (checks) return { value: `${checks} ${checks === 1 ? 'check' : 'checks'}`, sub: 'passed · no counts' }
  return { value: '—', sub: 'none reported' }
}

export function runSummaryOf({ rows, counts, archived, agents, workflows, board, trees, at }: RunSummaryInput) {
  const runs = workflowRunsOf(agents, workflows)
  const since = Math.min(...rows.flatMap(row => (row.live?.createdAt !== undefined ? [row.live.createdAt] : [])), board?.since ?? at)
  return {
    sessions: { total: rows.length, 'needs-you': counts['needs-you'], waiting: counts.waiting, working: counts.working, done: counts.done, archived },
    needsYou: { sessions: counts['needs-you'], subagents: agents.filter(one => one.state === 'running' && one.asking).length },
    subagents: stateCountsOf(subagentsOf(agents)),
    workflows: { ...stateCountsOf(runs), agents: runs.reduce((sum, run) => sum + run.agents.length, 0), agentsDone: runs.reduce((sum, run) => sum + run.counts.done, 0) },
    commits: { total: rows.reduce((sum, row) => sum + (row.board?.commits?.length ?? 0), 0), repos: trees.length },
    tests: testsOf(rows, board),
    duration: { since, ms: at - since },
    git: { dirty: trees.reduce((sum, repo) => sum + repo.worktrees.reduce((count, tree) => count + tree.dirty, 0), 0) },
  }
}
