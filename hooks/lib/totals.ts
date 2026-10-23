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

export function passedOf(rows: readonly Row[]) {
  const counts = rows.flatMap(row => {
    const latest = new Map((row.board?.tests ?? []).map(label => [label.split(' · ')[0] ?? label, label]))
    return [...latest.values()].flatMap(label => {
      const found = /(\d+)\s+(?:tests?\s+)?pass(?:ed|es)?\b/i.exec(label)
      return found ? [Number(found[1])] : []
    })
  })
  return counts.length ? counts.reduce((sum, count) => sum + count, 0) : undefined
}

export function runSummaryOf({ rows, counts, archived, agents, workflows, board, trees, at }: RunSummaryInput) {
  const runs = workflowRunsOf(agents, workflows)
  const since = Math.min(...rows.flatMap(row => (row.live?.createdAt !== undefined ? [row.live.createdAt] : [])), board?.since ?? at)
  return {
    sessions: { total: rows.length, 'needs-you': counts['needs-you'], waiting: counts.waiting, working: counts.working, done: counts.done, archived },
    needsYou: counts['needs-you'],
    subagents: stateCountsOf(subagentsOf(agents)),
    workflows: { ...stateCountsOf(runs), agents: runs.reduce((sum, run) => sum + run.agents.length, 0), agentsDone: runs.reduce((sum, run) => sum + run.counts.done, 0) },
    commits: { total: rows.reduce((sum, row) => sum + (row.board?.commits?.length ?? 0), 0), repos: trees.length },
    tests: board?.testsPassed !== undefined ? { passed: board.testsPassed, note: board.testsNote ?? '' } : passedOf(rows) === undefined ? undefined : { passed: passedOf(rows) ?? 0, note: '' },
    duration: { since, ms: at - since },
    git: { dirty: trees.reduce((sum, repo) => sum + repo.worktrees.reduce((count, tree) => count + tree.dirty, 0), 0) },
  }
}
