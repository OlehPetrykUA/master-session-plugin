import { expect, test } from 'claude-code/testing'

import type { AgentRecord, Board, LiveSession, WorkflowRecord } from '../../types'

import { liveOf } from '../testing/world'
import { ARCHIVED_PEEK, ageOf, blocksOf, countsOfItems, groupsOf, isAllDone, itemsOf, kindOfType, modelFamilyOf, rowTextOf, shownArchived } from './list'
import { countsOf, rowsOf } from './rows'
import { runSummaryOf } from './totals'

const NOW = 10_000_000

const board: Board = {
  sessions: [
    { id: 'a', name: 'env-e2e-test', state: 'needs-you', needsYou: 'Commit blocked' },
    { id: 'b', name: 'mod', state: 'working', progress: 'step 3 of 5 — build pane' },
    { id: 'c', name: 'pr', state: 'waiting', now: 'waiting on PR review' },
    { id: 'd', name: 'done', state: 'done', done: 'merged to main', progress: 'step 5 of 5 — ship' },
  ],
  needsYou: [],
  repos: [],
  source: 'tool',
}

const agents: AgentRecord[] = [
  { id: 'x1', type: 'Explore', description: 'Review auth flow', model: 'claude-haiku-5-5', requestedModel: 'haiku', state: 'running', startedAt: NOW - 180_000 },
  { id: 'x2', name: 'token-finder', type: 'master-session:researcher', description: 'Find token usages', model: 'claude-sonnet-5-5', state: 'done', startedAt: NOW - 300_000, endedAt: NOW - 180_000 },
  { id: 'w1', type: 'workflow-subagent', description: 'review:bugs', run: { id: 'wf_1', index: 1 }, state: 'done', startedAt: NOW - 360_000, endedAt: NOW - 300_000 },
  { id: 'w2', type: 'workflow-subagent', description: 'verify:band.ts', run: { id: 'wf_1', index: 2 }, state: 'failed', startedAt: NOW - 300_000, endedAt: NOW - 240_000 },
  { id: 'w3', type: 'workflow-subagent', description: 'verify:atoms.ts', run: { id: 'wf_1', index: 3 }, state: 'running', startedAt: NOW - 200_000 },
]

const workflows: WorkflowRecord[] = [{ id: 'wf_1', toolUseId: 't', name: 'review-changes', description: 'Review the branch', phases: ['Review', 'Verify', 'Report'], startedAt: NOW - 363_000 }]

const archived = (count: number): LiveSession[] => Array.from({ length: count }, (_, index) => ({ id: `z${index}`, name: `old-${index}`, title: '', cwd: '/', isRunning: false, isArchived: true, lastActivityAt: NOW - 7_200_000 }))

const items = itemsOf(rowsOf(board, liveOf()), agents, workflows)

test('the list holds sessions, then workflows, then subagents; each lands in its state group, finished agents in Done; workflow agents are no items', () => {
  expect(items.map(item => [item.kind, item.id, item.group])).toEqual([
    ['session', 'a', 'needs-you'],
    ['session', 'c', 'waiting'],
    ['session', 'b', 'working'],
    ['session', 'd', 'done'],
    ['workflow', 'wf_1', 'working'],
    ['subagent', 'x1', 'working'],
    ['subagent', 'x2', 'done'],
  ])
  expect(countsOfItems(items, 3)).toEqual({ all: 7, 'needs-you': 1, working: 3, waiting: 1, done: 2, archived: 3 })
  expect(isAllDone(items)).toBe(false)
  expect(isAllDone(items.filter(item => item.group === 'done'))).toBe(true)
  expect(isAllDone([])).toBe(false)
})

test('groups: All lists Needs you, Working, Waiting, Done and a closed Archived; a filter pins Needs you above its own group; the Archived chip opens it', () => {
  const ids = (chosen: Parameters<typeof groupsOf>[2], view: Parameters<typeof groupsOf>[3] = 'closed', old = archived(3)) =>
    groupsOf(items, old, chosen, view).map(group => [group.id, group.items.length, group.isPinned, group.isOpen])
  expect(ids('all')).toEqual([
    ['needs-you', 1, false, true],
    ['working', 3, false, true],
    ['waiting', 1, false, true],
    ['done', 2, false, true],
    ['archived', 0, false, false],
  ])
  expect(ids('all', 'open', [])).toEqual(ids('all').slice(0, 4))
  expect(ids('waiting')).toEqual([
    ['needs-you', 1, true, true],
    ['waiting', 1, false, true],
  ])
  expect(ids('needs-you')).toEqual([['needs-you', 1, false, true]])
  expect(ids('archived')).toEqual([
    ['needs-you', 1, true, true],
    ['archived', 0, false, true],
  ])
  const [open] = groupsOf(items, archived(5), 'all', 'open').filter(group => group.id === 'archived')
  expect(shownArchived(open!, 'open', 'all').length).toBe(ARCHIVED_PEEK)
  expect(shownArchived(open!, 'all', 'all').length).toBe(5)
  expect(shownArchived(open!, 'closed', 'archived').length).toBe(5)
})

test('row text: the kind, the line and the time for each kind; a needs line is the blocker, a workflow names its running agent and its failures', () => {
  const text = (id: string) => rowTextOf(items.find(item => item.id === id)!, NOW)
  expect(text('a')).toEqual(expect.objectContaining({ title: 'env-e2e-test', kind: 'Session', line: 'Commit blocked', isAlert: true }))
  expect(text('b')).toEqual(expect.objectContaining({ kind: 'Session', line: 'build pane', step: { done: 3, total: 5 } }))
  expect(text('c').line).toBe('waiting on PR review')
  expect(text('d').line).toBe('merged to main')
  expect(text('wf_1')).toEqual({ title: 'review-changes', kind: 'Workflow', line: 'verify:atoms.ts · 1 failed', isAlert: true, elapsed: '6m', step: { done: 1, total: 3 } })
  expect(text('x1')).toEqual({ title: 'Review auth flow', kind: 'Explore', line: 'haiku', isAlert: false, elapsed: '3m' })
  expect(text('x2')).toEqual(expect.objectContaining({ title: 'token-finder', kind: 'researcher', line: 'sonnet', elapsed: '2m' }))
  const done = itemsOf([], agents.map(agent => ({ ...agent, state: 'done' as const, endedAt: agent.endedAt ?? NOW })), workflows).find(item => item.kind === 'workflow')
  expect(rowTextOf(done!, NOW).line).toBe('3 phases')
  expect([kindOfType('a:b:c'), kindOfType('Explore'), modelFamilyOf('claude-opus-5-5'), modelFamilyOf('haiku'), modelFamilyOf(undefined)]).toEqual(['c', 'Explore', 'opus', 'haiku', ''])
})

test('summary blocks read the run totals as the design words them, zeros and dashes before any work', () => {
  const rows = rowsOf(board, liveOf())
  const totals = runSummaryOf({ rows, counts: countsOf(rows, []), archived: 0, agents, workflows, board, trees: [], at: NOW })
  const blocks = blocksOf(totals, true)
  expect(blocks.map(block => [block.label, block.value, block.sub, block.isAlert])).toEqual([
    ['Sessions', '4', '', false],
    ['Needs you', '1', '1 blocker', true],
    ['Subagents', '2', '1 running', false],
    ['Workflows', '1', '1/3 agents', false],
    ['Commits', '0', '—', false],
    ['Tests', '0', '—', false],
    ['Duration', '0m'.replace('0m', '<1m'), expect.stringMatching(/^since \d\d:\d\d$/), false],
    ['Git', '0', 'clean', false],
  ])
  expect(blocksOf(totals, true, '20:04')[6]?.sub).toMatch(/^\d\d:\d\d – 20:04$/)
  expect(blocksOf({ ...totals, subagents: { total: 2, running: 0, done: 2, failed: 0, asking: 0 } }, true)[2]?.sub).toBe('all finished')
  expect(blocks[0]?.dots).toEqual([
    { tone: 'green', count: 1 },
    { tone: 'amber', count: 1 },
    { tone: 'grey', count: 1 },
  ])
  const empty = blocksOf(runSummaryOf({ rows: [], counts: countsOf([], []), archived: 0, agents: [], workflows: [], board: null, trees: [], at: NOW }), false)
  expect(empty.map(block => [block.value, block.sub])).toEqual([
    ['0', ''],
    ['0', 'nothing waiting'],
    ['0', 'none'],
    ['0', 'none'],
    ['0', '—'],
    ['0', '—'],
    ['—', 'not started'],
    ['0', 'clean'],
  ])
})

test('ages read like the design: just now, minutes, hours, days', () => {
  expect([ageOf(10_000), ageOf(5 * 60_000), ageOf(2 * 3_600_000 + 60_000), ageOf(3 * 86_400_000)]).toEqual(['just now', '5m ago', '2h ago', '3d ago'])
})
