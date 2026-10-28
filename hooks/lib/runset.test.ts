import { expect, test } from 'claude-code/testing'

import type { AgentRecord, Board, Live, LiveSession, WorkflowRecord } from '../../types'

import { agentCountsOf, bandItemsOf, bandProgressWith, bandUnitsOf, bandViewOf, countsText, inRunOf } from './band'
import { blocksOf, clockOf, countsOfItems } from './list'
import { compactOf } from './format'
import { agentsInRun, runSetOf, runSummaryOf } from './totals'

const NOW = 100_000_000
const SINCE = NOW - 181 * 60_000
const MINUTE = 60_000

const board = (more: Partial<Board> = {}): Board => ({
  sessions: [
    { id: 'a', name: 'a', state: 'needs-you', needsYou: 'Approve' },
    { id: 'b', name: 'b', state: 'working' },
    { id: 'c', name: 'c', state: 'done' },
  ],
  needsYou: [],
  repos: [],
  source: 'tool',
  since: SINCE,
  ...more,
})

const session = (id: string, more: Partial<LiveSession> = {}): LiveSession => ({ id, name: id, title: id, cwd: '/', isRunning: false, isArchived: false, lastActivityAt: NOW, startedBy: 'master', createdAt: SINCE + MINUTE, ...more })

const live = (sessions: LiveSession[] = []): Live => ({ self: 'master', title: '', sessions, error: '', at: NOW })

const agent = (id: string, more: Partial<AgentRecord> = {}): AgentRecord => ({ id, type: 'Explore', description: id, state: 'done', startedAt: SINCE + MINUTE, endedAt: SINCE + 2 * MINUTE, ...more })

const setOf = (agents: AgentRecord[], more: { board?: Board; live?: Live; workflows?: WorkflowRecord[]; cleared?: number } = {}) =>
  runSetOf({ board: more.board ?? board(), live: more.live ?? live(), agents, workflows: more.workflows ?? [], cleared: more.cleared, at: NOW })

const summaryOf = (set: ReturnType<typeof setOf>, b = board()) => runSummaryOf({ rows: set.rows, sessions: [], agents: set.agents, workflows: set.workflows, board: b, trees: [], at: NOW, items: set.items })

test('proof 1: a subagent that ended ten minutes ago is still in Done, in the chip, the section and the Agents tile', () => {
  const set = setOf([agent('x', { endedAt: NOW - 10 * MINUTE })])
  const done = set.items.filter(item => item.kind === 'subagent' && item.group === 'done')
  expect(done.map(item => item.id)).toEqual(['x'])
  expect(countsOfItems(set.items, 0).done).toBe(1 + 1)
  const tile = blocksOf(summaryOf(set), true).find(block => block.key === 'agents')
  expect([tile?.value, tile?.sub]).toEqual(['1', '1 done'])
})

test('proof 2: a finished subagent from before the run is in no consumer, a running or asking one is in all of them', () => {
  const before = { startedAt: SINCE - 5 * MINUTE, endedAt: SINCE - 4 * MINUTE }
  const old = agent('old', before)
  const running = agent('run', { state: 'running', startedAt: SINCE - 5 * MINUTE, endedAt: undefined })
  const asking = agent('ask', { state: 'running', startedAt: SINCE - 5 * MINUTE, endedAt: undefined, asking: { text: 'Allow Bash', since: NOW } })
  const set = setOf([old, running, asking])
  expect(set.agents.map(one => one.id)).toEqual(['run', 'ask'])
  expect(set.items.filter(item => item.kind === 'subagent').map(item => item.id)).toEqual(['run', 'ask'])
  expect(summaryOf(set).agents).toEqual({ total: 2, working: 2, done: 0, failed: 0 })
  const counts = agentCountsOf([old, running, asking], [], NOW)
  expect(bandItemsOf(board(), counts, live()).filter(item => item.kind === 'subagent').map(item => item.id)).toEqual(['run', 'ask'])
  const units = bandUnitsOf([], board(), inRunOf(board(), counts), live())
  expect(units).toHaveLength(2)
  expect(agentsInRun(board(), [old, running, asking], [], NOW).agents.map(one => one.id)).toEqual(['run', 'ask'])
})

test('proof 3: with no board there is no run window, so only a running or asking item is listed and counted', () => {
  const old = agent('old', { startedAt: SINCE, endedAt: SINCE + MINUTE })
  const running = agent('run', { state: 'running', startedAt: SINCE, endedAt: undefined })
  const set = runSetOf({ board: null, live: live(), agents: [old, running], workflows: [], at: NOW })
  expect(set.since).toBe(NOW)
  expect(set.agents.map(one => one.id)).toEqual(['run'])
  expect(set.items.filter(item => item.kind === 'subagent').map(item => item.id)).toEqual(['run'])
  expect(runSummaryOf({ rows: set.rows, sessions: [], agents: set.agents, workflows: set.workflows, board: null, trees: [], at: NOW, items: set.items }).agents).toEqual({ total: 1, working: 1, done: 0, failed: 0 })
})

test('proof 3b: a session of unknown creation time is outside the run unless the board lists it', () => {
  const unknown = session('u1', { createdAt: undefined })
  expect(setOf([], { live: live([unknown]) }).rows.map(row => row.id)).not.toContain('u1')
  expect(setOf([], { board: board({ sessions: [{ id: 'u1', name: 'u1', state: 'working' }] }), live: live([unknown]) }).rows.map(row => row.id)).toContain('u1')
})

test('proof 3c: with no board, a running session of unknown creation time is counted: running and asking always count', () => {
  const unknown = session('u1', { createdAt: undefined, isRunning: true })
  const set = runSetOf({ board: null, live: live([unknown]), agents: [], workflows: [], at: NOW })
  expect(set.rows.map(row => row.id)).toEqual(['u1'])
  expect(set.items.map(item => item.id)).toEqual(['u1'])
})

test('proof 4: the Needs you tile is the chip, the Agents tile adds up, and the band reads the same items as the pane', () => {
  const asking = agent('ask', { state: 'running', endedAt: undefined, asking: { text: 'Allow Bash', since: NOW } })
  const flow: WorkflowRecord = { id: 'wf', toolUseId: 't', name: 'flow', startedAt: SINCE + MINUTE }
  const members = [agent('w1', { run: { id: 'wf', index: 1 } }), agent('w2', { run: { id: 'wf', index: 2 }, state: 'failed' }), agent('w3', { run: { id: 'wf', index: 3 } })]
  const agents = [agent('d1'), agent('f1', { state: 'failed' }), agent('r1', { state: 'running', endedAt: undefined }), asking, ...members]
  const sessions = live([session('a'), session('b', { isRunning: true }), session('c')])
  const set = setOf(agents, { live: sessions, workflows: [flow] })
  const counts = countsOfItems(set.items, set.archived.length)
  const summary = summaryOf(set)
  expect(summary.needsYou).toBe(counts['needs-you'])
  expect(counts['needs-you']).toBe(2)
  const { working, done, failed, total } = summary.agents
  expect(working + done + failed).toBe(total)
  expect(total).toBe(5)
  expect([working, done, failed]).toEqual([2, 1, 2])
  const doneSessions = set.items.filter(item => item.kind === 'session' && item.group === 'done').length
  expect(done + failed).toBe(counts.done - doneSessions)
  expect(bandItemsOf(board(), agentCountsOf(agents, [flow], NOW), sessions).map(item => item.id)).toEqual(set.items.map(item => item.id))
})

test('proof 4b: a working agent counts asking and waiting ones too, so working, done and failed add up to the value', () => {
  const parent = agent('p', { state: 'running', endedAt: undefined })
  const child = agent('k', { state: 'running', endedAt: undefined, parentAgentId: 'p', asking: { text: 'Allow Bash', since: NOW } })
  const set = setOf([parent, child, agent('d')])
  const items = set.items.filter(item => item.kind === 'subagent')
  expect(items.find(item => item.id === 'p')?.group).toBe('waiting')
  expect(items.find(item => item.id === 'k')?.group).toBe('needs-you')
  expect(summaryOf(set).agents).toEqual({ total: 3, working: 2, done: 1, failed: 0 })
})

test('proof 5: Clear done removes what ended at or before the mark from the chip, the tile and the band items together, and keeps the band units', () => {
  const agents = [agent('d1', { endedAt: NOW - 3 * MINUTE }), agent('d2', { endedAt: NOW - MINUTE }), agent('r1', { state: 'running', endedAt: undefined })]
  const cleared = NOW - 2 * MINUTE
  const before = setOf(agents)
  const after = setOf(agents, { cleared })
  expect(summaryOf(before).agents.done).toBe(2)
  expect([countsOfItems(after.items, 0).done - countsOfItems(before.items, 0).done, summaryOf(after).agents.done]).toEqual([-1, 1])
  expect(bandItemsOf(board(), agentCountsOf(agents, [], NOW, cleared), live()).map(item => item.id)).toEqual(after.items.map(item => item.id))
  expect(bandUnitsOf([], board(), inRunOf(board(), agentCountsOf(agents, [], NOW, cleared)), live())).toHaveLength(3)
})

test('proof 6: helpers are listed and counted, and the plan and the band done/total stay builder-only', () => {
  const plan = [{ name: 'p1', state: 'done' as const }, { name: 'p2', state: 'working' as const }]
  const b = board({ plan, sessions: [{ id: 'b', name: 'b', state: 'working' }] })
  const helpers = [agent('qa', { type: 'master-session:qa-verifier' }), agent('rev', { type: 'master-session:reviewer' }), agent('impl', { type: 'master-session:implementer', state: 'running', endedAt: undefined })]
  const withHelpers = setOf(helpers, { board: b })
  const without = setOf([], { board: b })
  expect(withHelpers.items.filter(item => item.kind === 'subagent').map(item => item.id)).toEqual(['qa', 'rev', 'impl'])
  expect(summaryOf(withHelpers, b).agents.total).toBe(3)
  expect(summaryOf(withHelpers, b).plan).toEqual(summaryOf(without, b).plan)
  const partsOf = (agents: AgentRecord[]) => {
    const counts = inRunOf(b, agentCountsOf(agents, [], NOW))
    const progress = bandProgressWith(b, live(), counts)
    return progress ? countsText(bandViewOf(100, b, progress, false, counts, { board: () => undefined, chat: () => undefined }, live()).parts) : ''
  }
  expect(partsOf(helpers)).toBe('1/2')
  expect(partsOf([])).toBe('1/2')
})

test('proof 6b: a session row whose id equals an agent id still counts that agent child in the band, as the run set does', () => {
  const b = board({ sessions: [{ id: 'x', name: 'x', state: 'working' }] })
  const agents = [agent('x', { state: 'running', endedAt: undefined }), agent('c', { parentSessionId: 'x' })]
  const set = setOf(agents, { board: b })
  expect(set.items.filter(item => item.kind === 'subagent').map(item => item.id)).toContain('c')
  const counts = inRunOf(b, agentCountsOf(agents, [], NOW))
  const progress = bandProgressWith(b, live(), counts)
  const view = progress && bandViewOf(100, b, progress, false, counts, { board: () => undefined, chat: () => undefined }, live())
  expect([view && countsText(view.parts), view?.percent]).toEqual(['1/2', 50])
})

test('proof 7: an archived session counts only when it is on the board or was created inside the run', () => {
  const old = session('z1', { isArchived: true, createdAt: SINCE - 5 * MINUTE })
  const fresh = session('z2', { isArchived: true })
  expect(setOf([], { live: live([old]) }).archived).toEqual([])
  expect(setOf([], { live: live([old, fresh]) }).archived.map(one => one.id)).toEqual(['z2'])
  expect(setOf([], { board: board({ sessions: [{ id: 'z1', name: 'z1', state: 'done' }] }), live: live([old]) }).archived.map(one => one.id)).toEqual(['z1'])
})

test('proof 8: a launch with no agents for two minutes stays hidden, a fresh one shows', () => {
  const launch = (startedAt: number): WorkflowRecord => ({ id: 'wf', toolUseId: 't', name: 'flow', startedAt })
  expect(setOf([], { workflows: [launch(NOW - 130_000)] }).items.filter(item => item.kind === 'workflow')).toEqual([])
  expect(setOf([], { workflows: [launch(NOW - 10_000)] }).items.filter(item => item.kind === 'workflow')).toHaveLength(1)
})

test('proof 9: the run lasted 3h 1m: the tile, its since line and the band elapsed agree', () => {
  const b = board({ plan: [{ name: 'p1', state: 'working' }] })
  const set = setOf([], { board: b })
  expect(set.since).toBe(SINCE)
  const block = blocksOf(summaryOf(set, b), true).find(one => one.key === 'duration')
  expect([block?.value, block?.sub]).toEqual(['3h 1m', `since ${clockOf(SINCE)}`])
  const counts = inRunOf(b, agentCountsOf([], [], NOW))
  const progress = bandProgressWith(b, live(), counts)
  expect(progress && bandViewOf(100, b, progress, false, counts, { board: () => undefined, chat: () => undefined }, live()).elapsed).toBe(compactOf(NOW - SINCE))
  expect(compactOf(NOW - SINCE)).toBe('3h 1m')
})

test('a finished workflow run of the run window is one Agents entry whose agents add to Tokens, never sessions', () => {
  const flow: WorkflowRecord = { id: 'wf', toolUseId: 't', name: 'flow', startedAt: SINCE + MINUTE }
  const members = [agent('w1', { run: { id: 'wf', index: 1 }, tokens: 1_500 }), agent('w2', { run: { id: 'wf', index: 2 }, state: 'failed', tokens: 500 })]
  const set = setOf(members, { workflows: [flow] })
  const summary = summaryOf(set)
  expect(summary.agents).toEqual({ total: 1, working: 0, done: 0, failed: 1 })
  expect(summary.tokens).toBe(2_000)
  const tile = blocksOf(summary, true).find(block => block.key === 'agents')
  expect([tile?.bad, tile?.sub]).toEqual(['1 failed', ''])
})
