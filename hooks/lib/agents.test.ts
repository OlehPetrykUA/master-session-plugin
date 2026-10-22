import { expect, test } from 'claude-code/testing'

import type { AgentRecord, Board, WorkflowRecord } from '../../types'

import { liveOf } from '../testing/world'
import { stateCountsOf, subagentsOf, workflowRunsOf } from './agents'
import { countsOf, rowsOf } from './rows'
import { runSummaryOf } from './totals'

const NOW = 1_000_000

const AGENTS: AgentRecord[] = [
  { id: 'a1', name: 'probe-helper', type: 'general-purpose', description: 'Say gamma', state: 'running', startedAt: NOW },
  { id: 'w2', type: 'workflow-subagent', description: 'beta-check', model: 'claude-haiku-5-5', run: { id: 'wf_9', index: 2 }, state: 'running', startedAt: NOW + 20 },
  { id: 'a2', type: 'Explore', description: 'Find callers', state: 'done', startedAt: NOW, endedAt: NOW + 90_000 },
  { id: 'w1', type: 'workflow-subagent', description: 'alpha-scan', run: { id: 'wf_9', index: 1 }, state: 'failed', startedAt: NOW + 10, endedAt: NOW + 15 },
  { id: 'v1', type: 'workflow-subagent', description: 'lone', run: { id: 'wf_old', index: 1 }, state: 'done', startedAt: NOW, endedAt: NOW + 40 },
]

const RUNS: WorkflowRecord[] = [
  { id: 'wf_9', toolUseId: 'toolu_wf', taskId: 'wi5', name: 'probe-run', description: 'Probe the spawn event', startedAt: NOW + 5 },
  { id: 'wf_new', toolUseId: 'toolu_new', name: 'fresh', startedAt: NOW + 50 },
]

test('subagents are the Agent tool agents only: workflow agents never count as subagents', () => {
  expect(subagentsOf(AGENTS).map(one => one.id)).toEqual(['a1', 'a2'])
  expect(stateCountsOf(subagentsOf(AGENTS))).toEqual({ total: 2, running: 1, done: 1, failed: 0 })
})

test('workflow runs gather their agents by index under the launch name, with state, span and counts', () => {
  const runs = workflowRunsOf(AGENTS, RUNS)
  expect(runs.map(run => [run.id, run.name, run.state, run.startedAt, run.endedAt])).toEqual([
    ['wf_9', 'probe-run', 'running', NOW + 5, undefined],
    ['wf_new', 'fresh', 'running', NOW + 50, undefined],
    ['wf_old', 'wf_old', 'done', NOW, NOW + 40],
  ])
  expect(runs[0]).toEqual(
    expect.objectContaining({
      description: 'Probe the spawn event',
      taskId: 'wi5',
      counts: { total: 2, running: 1, done: 0, failed: 1 },
      agents: [
        { id: 'w1', index: 1, label: 'alpha-scan', type: 'workflow-subagent', model: undefined, state: 'failed', startedAt: NOW + 10, endedAt: NOW + 15 },
        { id: 'w2', index: 2, label: 'beta-check', type: 'workflow-subagent', model: 'claude-haiku-5-5', state: 'running', startedAt: NOW + 20, endedAt: undefined },
      ],
    }),
  )
  const settled = workflowRunsOf(AGENTS.map(one => (one.id === 'w2' ? { ...one, state: 'done' as const, endedAt: NOW + 70 } : one)), RUNS)[0]
  expect([settled?.state, settled?.endedAt]).toEqual(['failed', NOW + 70])
  expect(workflowRunsOf([], [])).toEqual([])
})

test('the run summary counts sessions by state, needs you, subagents, workflows, commits, tests where the board has them, and the duration', () => {
  const board: Board = {
    sessions: [
      { id: 'a', name: 'a', state: 'working', commits: ['1a2b3c4 one', '5d6e7f8 two'] },
      { id: 'b', name: 'b', state: 'needs-you', commits: ['9a9a9a9 three'] },
      { id: 'c', name: 'c', state: 'done' },
    ],
    needsYou: [],
    repos: [],
    source: 'tool',
    testsPassed: 526,
    testsNote: 'smoke 398 · hooks 128',
    since: NOW - 60_000,
  }
  const live = liveOf(['d'])
  const rows = rowsOf(board, { ...live, sessions: live.sessions.map(one => (one.id === 'a' ? { ...one, createdAt: NOW - 3_600_000 } : one)) })
  expect(runSummaryOf({ rows, counts: countsOf(rows, []), archived: 1, agents: AGENTS, workflows: RUNS, board, trees: [], at: NOW })).toEqual({
    sessions: { total: 3, 'needs-you': 1, waiting: 0, working: 1, done: 1, archived: 1 },
    needsYou: 1,
    subagents: { total: 2, running: 1, done: 1, failed: 0 },
    workflows: { total: 3, running: 2, done: 1, failed: 0, agents: 3 },
    commits: { total: 3, repos: 0 },
    tests: { passed: 526, note: 'smoke 398 · hooks 128' },
    duration: { since: NOW - 3_600_000, ms: 3_600_000 },
  })
  const empty = runSummaryOf({ rows: [], counts: countsOf([], []), archived: 0, agents: [], workflows: [], board: null, trees: [], at: NOW })
  expect([empty.tests, empty.duration]).toEqual([undefined, { since: NOW, ms: 0 }])
})
