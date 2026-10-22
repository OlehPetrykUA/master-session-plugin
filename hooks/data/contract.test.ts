import { expect, test } from 'claude-code/testing'

import type { BoardSession, Live, LiveSession } from '../../types'

import { boardFromJson } from '../lib/board'
import {
  accept,
  answerOf,
  askSummary,
  applyIntent,
  askOf,
  askTargets,
  askText,
  isArchivable,
  fitsSvg,
  freshReport,
  merge,
  parseIntent,
  parseReport,
  parseStep,
  reportsView,
  stamped,
} from './contract'
import type { Published, Report } from './contract'

const MASTER = 'local_master'
const MIN = 60_000
const NOW = 100 * MIN

const report = (patch: Partial<Report> = {}): Report => ({ ...freshReport('local_a', MASTER, 'engine-a', 0), seq: 1, at: 90 * MIN, modelAt: 90 * MIN, ...patch })

const liveOne = (id: string, isRunning: boolean, patch: Partial<LiveSession> = {}): LiveSession => ({
  id,
  name: id.replace('local_', ''),
  title: `${id} title`,
  cwd: '/',
  isRunning,
  isArchived: false,
  lastActivityAt: 0,
  ...patch,
})

const liveOf = (...sessions: LiveSession[]): Live => ({ self: MASTER, title: 'Master', sessions, error: '', at: 0 })

const boardOf = (at: number, ...sessions: BoardSession[]): Published => ({ at, sessions, needsYou: [], repos: [], source: 'tool' })

const row = (patch: Partial<BoardSession> = {}): BoardSession => ({ id: 'local_a', name: 'alpha', state: 'working', ...patch })

test('progress parses "step N of M — label" and rejects M=0, N>M and other shapes', () => {
  expect(parseStep('step 3 of 5 — build screens')).toEqual({ step: 3, of: 5, label: 'build screens' })
  expect(parseStep('Step 2 of 4: tests')).toEqual({ step: 2, of: 4, label: 'tests' })
  expect(parseStep('step 1 of 1')).toEqual({ step: 1, of: 1, label: '' })
  for (const bad of ['step 1 of 0', 'step 6 of 5', 'step x of 5', 'three of five', '']) expect(parseStep(bad)).toBeUndefined()
})

test('report input: bad state and bad progress are errors; commit and test claims go to activity', () => {
  expect(parseIntent({ state: 'sleeping' }).error).toContain('state must be one of')
  expect(parseIntent({ progress: 'step 2 of 0' }).error).toContain('step N of M')
  expect(parseIntent({ state: '🔴', needsYou: 'approve' }).intent).toEqual(expect.objectContaining({ state: 'needs-you', needsYou: 'approve' }))
  const { intent } = parseIntent({ progress: 'step 2 of 3 — wire', activity: ['read the design'], commits: ['abc1234 feat: x'], tests: ['42 passed'], files: ['a.ts'] })
  expect(intent?.progress).toEqual({ step: 2, of: 3, label: 'wire' })
  expect(intent?.activity).toEqual(['read the design', 'commit abc1234 feat: x', 'tests 42 passed'])
  expect(intent?.files).toEqual(['a.ts'])
})

test('applying intent stamps modelAt, keeps unset fields and clears needsYou once the state moves on', () => {
  const asking = applyIntent(report(), { state: 'needs-you', needsYou: 'approve the plan', activity: [], files: [] }, NOW)
  expect([asking.state, asking.needsYou, asking.modelAt]).toEqual(['needs-you', 'approve the plan', NOW])
  const still = applyIntent(asking, { now: 'waiting', activity: [], files: ['b.ts'] }, NOW + 1)
  expect([still.needsYou, still.now, still.files]).toEqual(['approve the plan', 'waiting', ['b.ts']])
  const moved = applyIntent(still, { state: 'working', activity: ['resumed'], files: [] }, NOW + 2)
  expect([moved.state, moved.needsYou, moved.now]).toEqual(['working', undefined, 'waiting'])
  expect(moved.activity).toEqual([{ at: NOW + 2, text: 'resumed' }])
  expect(stamped(moved, NOW + 3)).toEqual(expect.objectContaining({ seq: moved.seq + 1, at: NOW + 3 }))
})

test('a report file: a lower seq is ignored and a parse failure keeps the last good value', () => {
  const good = report({ seq: 5, now: 'good' })
  expect(accept(undefined, JSON.parse(JSON.stringify(good)))?.now).toBe('good')
  expect(accept(good, { ...good, seq: 4, now: 'older' })).toBe(good)
  expect(accept(good, { ...good, seq: 6, now: 'newer' })?.now).toBe('newer')
  for (const broken of [undefined, null, 'text', { ...good, v: 2 }, { ...good, state: 'lost' }, { ...good, seq: 'x' }]) expect(accept(good, broken)).toBe(good)
  expect(parseReport({ ...good, progress: { step: 4, of: 0, label: '' } })?.progress).toBeUndefined()
  expect(parseReport({ ...good, git: 'main' })?.git).toBeUndefined()
})

test('merge: the newer of report and board wins per live field, with the older filling gaps', () => {
  const live = liveOf(liveOne('local_a', true))
  const older = merge(boardOf(80 * MIN, row({ now: 'board now', next: 'board next' })), [report({ now: 'report now' })], live, NOW).sessions[0]
  expect([older?.now, older?.next]).toEqual(['report now', 'board next'])
  const newer = merge(boardOf(95 * MIN, row({ now: 'board now' })), [report({ now: 'report now', next: 'report next' })], live, NOW).sessions[0]
  expect([newer?.now, newer?.next]).toEqual(['board now', 'report next'])
  const facts = merge(boardOf(95 * MIN, row()), [report({ modelAt: 10 * MIN, at: 99 * MIN, now: 'stale intent', commits: [{ sha: 'abc1234', subject: 'feat: x', at: 0 }] })], live, NOW).sessions[0]
  expect([facts?.now, facts?.commits, facts?.sha]).toEqual(['stale intent', ['abc1234 feat: x'], 'abc1234'])
  const ruled = merge(boardOf(95 * MIN, row({ now: 'board now' })), [report({ modelAt: 10 * MIN, at: 99 * MIN, now: 'stale intent' })], live, NOW).sessions[0]
  expect(ruled?.now).toBe('board now')
})

test('merge: a needs-you report wins at once, even against a newer board', () => {
  const merged = merge(boardOf(99 * MIN, row({ state: 'working' })), [report({ state: 'needs-you', needsYou: 'approve settings.json', modelAt: 50 * MIN })], liveOf(liveOne('local_a', false)), NOW)
  expect(merged.sessions[0]).toEqual(expect.objectContaining({ state: 'needs-you', needsYou: 'approve settings.json' }))
  const resolved = merge(boardOf(99 * MIN, row({ state: 'needs-you', needsYou: 'old' })), [report({ state: 'working', modelAt: 99.5 * MIN })], liveOf(liveOne('local_a', true)), NOW)
  expect([resolved.sessions[0]?.state, resolved.sessions[0]?.needsYou]).toEqual(['working', undefined])
})

test('merge: a reported done shows unverified until the board marks it verified', () => {
  const live = liveOf(liveOne('local_a', false))
  const done = merge(boardOf(80 * MIN, row()), [report({ state: 'done' })], live, NOW).sessions[0]
  expect([done?.state, done?.isVerified, done?.note]).toEqual(['done', false, 'done · unverified'])
  const verified = merge(boardOf(95 * MIN, row({ state: 'done', verified: 'tests 13/13, screenshot' })), [report({ state: 'done' })], live, NOW).sessions[0]
  expect([verified?.isVerified, verified?.note]).toEqual([true, undefined])
})

test('merge: a turn that started after the board shows working with the report, a stopped one keeps the board', () => {
  const board = boardOf(80 * MIN, row({ state: 'done', now: 'shipped', progress: 'step 5 of 5 — shipped' }))
  const turn = report({ state: 'done', modelAt: 70 * MIN, now: 'fixing the pin', progress: { step: 2, of: 4, label: 'pin' }, run: { isRunning: true, since: 81 * MIN } })
  const running = merge(board, [turn], liveOf(liveOne('local_a', true)), NOW).sessions[0]
  expect([running?.state, running?.now, running?.progress]).toEqual(['working', 'fixing the pin', 'step 2 of 4 — pin'])
  const stopped = merge(board, [{ ...turn, run: { isRunning: false, since: 81 * MIN } }], liveOf(liveOne('local_a', false)), NOW).sessions[0]
  expect([stopped?.state, stopped?.now]).toEqual(['done', 'shipped'])
  const before = merge(board, [{ ...turn, run: { isRunning: true, since: 79 * MIN } }], liveOf(liveOne('local_a', true)), NOW).sessions[0]
  expect(before?.state).toBe('done')
  const asking = merge(boardOf(80 * MIN, row({ state: 'needs-you', needsYou: 'approve' })), [turn], liveOf(liveOne('local_a', true)), NOW).sessions[0]
  expect(asking?.state).toBe('needs-you')
})

test('merge: a lower seq for the same session is ignored', () => {
  const merged = merge(null, [report({ seq: 7, now: 'seven' }), report({ seq: 3, now: 'three', at: 99 * MIN })], liveOf(liveOne('local_a', true)), NOW)
  expect(merged.sessions.map(one => one.now)).toEqual(['seven'])
})

test('merge: idle-but-working shows the report age; a running worker quiet for 10 min shows a dim last-report note', () => {
  const idle = merge(boardOf(0, row()), [report({ at: 88 * MIN })], liveOf(liveOne('local_a', false)), NOW).sessions[0]
  expect([idle?.note, idle?.isQuiet, idle?.ageMinutes]).toEqual(['idle · report 12m ago', false, 12])
  const quiet = merge(boardOf(0, row()), [report({ at: 88 * MIN })], liveOf(liveOne('local_a', true)), NOW).sessions[0]
  expect([quiet?.note, quiet?.isQuiet]).toEqual(['last report 12m ago', true])
  const busy = merge(boardOf(0, row()), [report({ at: 95 * MIN })], liveOf(liveOne('local_a', true)), NOW).sessions[0]
  expect([busy?.note, busy?.isQuiet]).toEqual([undefined, false])
})

test('merge: reports of this master join the board; another master’s workers stay out', () => {
  const live = liveOf(liveOne('local_a', true), liveOne('local_b', true), liveOne('local_c', true))
  const reports = [report(), report({ session: 'local_b', progress: { step: 1, of: 2, label: 'read' } }), report({ session: 'local_c', parent: 'local_other' })]
  const merged = merge(boardOf(80 * MIN, row()), reports, live, NOW)
  expect(merged.sessions.map(one => [one.id, one.name, one.progress])).toEqual([
    ['local_a', 'alpha', undefined],
    ['local_b', 'b', 'step 1 of 2 — read'],
  ])
  expect(merge(null, [], live, NOW)).toEqual({ sessions: [], needsYou: [], repos: [], source: 'file' })
})

test('reports tool view: one entry per own worker with age, state and step', () => {
  const live = liveOf(liveOne('local_a', true), liveOne('local_c', true))
  const view = reportsView(null, [report({ progress: { step: 2, of: 5, label: 'build' }, now: 'coding', needsYou: undefined }), report({ session: 'local_c', parent: 'local_other' })], live, NOW)
  expect(view).toEqual({
    sessions: [{ id: 'local_a', title: 'local_a title', at: new Date(90 * MIN).toISOString(), ageMinutes: 10, state: 'working', progress: 'step 2 of 5 — build', now: 'coding', next: undefined, needsYou: undefined }],
  })
})

test('ask: only running, unarchived workers are targets; the envelope round-trips; no answer after 2 min', () => {
  const live = liveOf(liveOne('local_a', true), liveOne('local_b', false), liveOne('local_c', true, { isArchived: true }), liveOne('local_d', true))
  expect(askTargets([report()], live, ['local_a', 'local_b', 'local_c'])).toEqual([{ id: 'local_a', engineId: 'engine-a' }])
  const text = askText({ from: MASTER, at: NOW })
  expect(askOf(`From validator: ${text}`)).toEqual({ from: MASTER, at: NOW })
  expect(askOf('[master-session:ask] {broken')).toBeUndefined()
  expect(askOf('plain message')).toBeUndefined()
  expect(answerOf(NOW, report({ at: NOW + 1 }), NOW + 5)).toBe('answered')
  expect(answerOf(NOW, report({ at: NOW - 1 }), NOW + MIN)).toBe('asking')
  expect(answerOf(NOW, undefined, NOW + 2 * MIN)).toBe('no answer')
})

test('archive: done or idle rows that are not running, archived or waiting for an answer; the Svg guard stays under 131072', () => {
  expect(isArchivable({ state: 'done' }, liveOne('local_a', false))).toBe(true)
  expect(isArchivable({ state: 'waiting' }, liveOne('local_a', false))).toBe(true)
  expect(isArchivable({ state: 'working' }, liveOne('local_a', false))).toBe(true)
  expect(isArchivable({ state: 'done' }, liveOne('local_a', true))).toBe(false)
  expect(isArchivable({ state: 'done' }, liveOne('local_a', false, { isArchived: true }))).toBe(false)
  expect(isArchivable({ state: 'done' }, undefined)).toBe(false)
  expect(isArchivable({ state: 'needs-you' }, liveOne('local_a', false))).toBe(false)
  expect(fitsSvg('x'.repeat(131_071))).toBe(true)
  expect(fitsSvg('x'.repeat(131_072))).toBe(false)
})

test('merge: a stopped worker shows waiting with what it waits on; a running one keeps its reported state', () => {
  const stopped = report({ run: { isRunning: false, lastEnd: { at: 95 * MIN, reason: 'answer' } }, waits: { since: 95 * MIN, on: 'the next message' }, now: 'implementing the band' })
  const fromReport = merge(null, [stopped], liveOf(), NOW).sessions[0]
  expect([fromReport?.state, fromReport?.now]).toEqual(['waiting', 'idle · waiting for the next message'])
  const fromLive = merge(null, [stopped], liveOf(liveOne('local_a', true)), NOW).sessions[0]
  expect([fromLive?.state, fromLive?.now]).toEqual(['working', 'implementing the band'])
  const liveWins = merge(null, [report({ run: { isRunning: true } })], liveOf(liveOne('local_a', false)), NOW).sessions[0]
  expect(liveWins?.state).toBe('waiting')
  for (const state of ['needs-you', 'done'] as const) {
    const kept = merge(null, [report({ state, run: { isRunning: false } })], liveOf(liveOne('local_a', false)), NOW).sessions[0]
    expect(kept?.state).toBe(state)
  }
})

test('merge: a board-only working row whose session is not running shows waiting too', () => {
  const idle = merge(boardOf(80 * MIN, row({ now: 'stale board line' })), [], liveOf(liveOne('local_a', false)), NOW).sessions[0]
  expect([idle?.state, idle?.now, idle?.note]).toEqual(['waiting', 'idle · waiting for the next message', 'idle'])
  const running = merge(boardOf(80 * MIN, row({ now: 'coding' })), [], liveOf(liveOne('local_a', true)), NOW).sessions[0]
  expect([running?.state, running?.now]).toEqual(['working', 'coding'])
  const unknown = merge(boardOf(80 * MIN, row()), [], liveOf(), NOW).sessions[0]
  expect(unknown?.state).toBe('working')
})

test('the Ask toast names what it did: running workers asked, idle ones skipped', () => {
  expect(askSummary([{ via: 'mod' }, { via: 'message' }], 3)).toBe('Asked 2 running workers · 3 idle skipped')
  expect(askSummary([{ via: 'mod' }], 0)).toBe('Asked 1 running worker')
  expect(askSummary([{ via: 'mod' }, { via: 'failed' }], 1)).toBe('Asked 1 running worker · 1 not reached · 1 idle skipped')
  expect(askSummary([], 3)).toBe('No running workers to ask · 3 idle, their last state is shown')
  expect(askSummary([], 0)).toBe('No running workers to ask')
})

test('persona: the report tool takes it, a report file keeps it with its agents, the board JSON keeps it, and merge fills it from either side', () => {
  const intent = parseIntent({ persona: 'Implementer' })
  expect(intent.intent?.persona).toBe('Implementer')
  const agents = [{ id: 'a1', type: 'Explore', description: 'Find callers', state: 'running', startedAt: 1, asking: { text: 'Allow Bash: ls', since: 2 } }, { id: 'bad', state: 'running' }]
  expect(parseReport({ ...report({ persona: 'Refactorer' }), agents })).toEqual(expect.objectContaining({ persona: 'Refactorer', agents: [agents[0]] }))
  expect(boardFromJson({ sessions: [{ id: 'local_a', state: 'working', persona: 'Designer' }] })?.sessions[0]?.persona).toBe('Designer')
  const live = liveOf(liveOne('local_a', true))
  expect(merge(boardOf(80 * MIN, row()), [report({ persona: 'Implementer' })], live, NOW).sessions[0]?.persona).toBe('Implementer')
  expect(merge(boardOf(95 * MIN, row({ persona: 'Reviewer' })), [report()], live, NOW).sessions[0]?.persona).toBe('Reviewer')
})

test("an asking agent in a working report makes the row and the reports tool needs-you with the agent's prompt, over a stale needsYou", () => {
  const asking = [{ id: 'a2', type: 'Explore', description: 'Check one caller', state: 'running' as const, startedAt: 1, asking: { text: 'Allow Bash: rm -rf build', since: 2 } }]
  const stale = applyIntent(report({ state: 'needs-you', needsYou: 'old blocker' }), { state: 'working', needsYou: 'old blocker', activity: [], files: [] }, 90 * MIN)
  expect([stale.state, stale.needsYou]).toEqual(['working', 'old blocker'])
  const live = liveOf(liveOne('local_a', true))
  const merged = merge(boardOf(80 * MIN, row()), [{ ...stale, agents: asking }], live, NOW).sessions[0]
  expect([merged?.state, merged?.needsYou]).toEqual(['needs-you', 'Allow Bash: rm -rf build'])
  const own = merge(boardOf(80 * MIN, row()), [report({ state: 'needs-you', needsYou: 'approve settings.json', agents: asking })], live, NOW).sessions[0]
  expect(own?.needsYou).toBe('approve settings.json')
  const view = reportsView(null, [{ ...stale, agents: asking }], live, NOW).sessions[0]
  expect([view?.state, view?.needsYou]).toEqual(['needs-you', 'Allow Bash: rm -rf build'])
  expect(merge(boardOf(80 * MIN, row()), [stale], live, NOW).sessions[0]?.state).toBe('working')
})
