import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { boardPath, reportPath } from './status'
import type { Child } from '../testing/world'
import { BAND, BOARD, BOARD_TOOL, HOME, MASTER, PANE, SELF, altsOf, childOf, started, textsOf, typed, warmUp, world } from '../testing/world'

warmUp()

const PROBE = {
  name: 'stop-probe',
  register(on: On) {
    on('ui.render', { component: 'Pane', requestId: 'stop-probe' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      const board = await $.state.get({ plugin: 'master-session', key: 'board' })
      const role = await $.state.get({ plugin: 'master-session', key: 'role' })
      const stopped = await $.state.get({ plugin: 'master-session', key: 'stopped' })
      const isPlan = await $.state.get({ plugin: 'master-session', key: 'isPlan' })
      const reports = await $.state.get({ plugin: 'master-session', key: 'reports' })
      return <Text>{JSON.stringify({ board: board.value ?? null, role: role.value ?? null, stopped: stopped.value ?? false, isPlan: isPlan.value ?? false, reports: reports.value ?? [] })}</Text>
    })
  },
}

const WITH = { plugins: [PROBE] }

async function atomsOf($: Engine) {
  const ui = await $.ui.mount({ ...PANE, plugin: 'stop-probe', requestId: 'stop-probe', surface: 'terminal' })
  const found = await ui.find({ type: 'Text' })
  await ui.unmount()
  return JSON.parse(String(found?.text)) as { board: unknown; role: unknown; stopped: boolean; isPlan: boolean; reports: { session: string }[] }
}

const STOP = 'master-session:stop'
const OPEN = 'mcp__master-session__open' as const
const REPORTS = 'mcp__master-session__reports' as const
const REPORT = 'mcp__master-session__report' as const
const M1 = 'This session is not a master session: nothing to stop.'
const M3 = 'Stopped: this session is no longer a master session. The band and pane are off; workers, branches and worktrees are untouched. Run /master-session:start to make it a master again.'
const C1 =
  '(to the model, hidden) The user ran /master-session:stop: this session is no longer a master session. Stop its heartbeat now (ScheduleWakeup with stop: true, or delete its /loop job), run no more master-session ticks and do not call mcp__master-session__board. Do not stop, message or archive any worker.'
const C2 =
  "(to the model, hidden) The user ran /master-session:stop: this session no longer reports to a master session. Do not call mcp__master-session__report; carry on with the user's requests."
const M4 = `Stopped: this session no longer reports to master session ${MASTER}. A new worker brief makes it report again.`
const M5 = 'This session is not a master session: run /master-session:start to make it one.'
const NO_MASTER = 'This session has no master session: report status in chat instead.'
const START = { skill: 'master-session:start', text: 'Validator.', frontmatter: {}, source: 'plugin' } as const
const WORKER = { skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' } as const
let failing = false
let files: Record<string, string> = {}
const OWN = boardPath(HOME, SELF)
const ONLY_WORKING = { ...BOARD, sessions: [{ ...BOARD.sessions[0], state: 'working', needsYou: undefined }, BOARD.sessions[1]], needsYou: [] }

function engineBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

function recorders(on: On) {
  const writes: { path: string; text: string }[] = []
  const closed: string[] = []
  failing = false
  on('fs.write', (_, e) => {
    if (failing) throw new Error('disk full')
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('classic.UserPromptSubmit', () => ({}))
  return { writes, closed }
}

async function master($: Engine, on: On, board: unknown = BOARD, child: Child = {}) {
  const rec = recorders(on)
  const run = await started($, on, board, child)
  rec.writes.length = 0
  return { ...run, ...rec }
}

const ranOf = (answer: { text?: string; context?: readonly string[] }) => [answer.text, answer.context]

const quiet = (run: { calls: unknown[]; gits: unknown[]; writes: unknown[]; scans: { messages: number } }) => [run.calls.length, run.gits.length, run.writes.length, run.scans.messages]

async function stopped($: Engine, on: On, board: unknown = BOARD, child: Child = {}) {
  const run = await master($, on, board, child)
  const answer = await $.command.run(typed(STOP, ''))
  await run.clock.settle()
  return { ...run, answer }
}

async function worker($: Engine, on: On, slowMs?: Child['slowMs']) {
  const rec = recorders(on)
  const child = { ...childOf(3_600_000), slowMs }
  const run = world(on, child)
  files = child.files ?? {}
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.tool.call({ tool: REPORT, state: 'working' })
  await run.clock.settle()
  return { ...run, ...rec }
}

test('AC1 a plain session answers M1 and does nothing', async ($, on) => {
  const rec = recorders(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  const before = run.tools.length
  const answer = await $.command.run(typed(STOP, ''))
  await run.clock.settle()
  expect(ranOf(answer)).toEqual([M1, undefined])
  expect([run.calls.length, run.gits.length, rec.writes.length, rec.closed.length, run.tools.length - before, run.opened.length, run.toasts.length]).toEqual([0, 0, 0, 0, 0, 0, 0])
})

test('AC2 a stopped session answers M1 to stop and stop force', async ($, on) => {
  const run = await stopped($, on)
  const before = quiet(run)
  const closed = run.closed.length
  const shown = [run.opened.length, run.toasts.length]
  for (const args of ['', 'force']) expect(ranOf(await $.command.run(typed(STOP, args)))).toEqual([M1, undefined])
  expect(quiet(run)).toEqual(before)
  expect(run.closed.length).toBe(closed)
  expect([run.opened.length, run.toasts.length]).toEqual(shown)
})

test('AC3 AC7 a master with Working rows gets M2 and nothing changes', WITH, async ($, on) => {
  const run = await master($, on, ONLY_WORKING)
  const before = run.calls.length
  const opened = run.opened.length
  const gits = run.gits.length
  const answer = await $.command.run(typed(STOP, ''))
  await run.clock.settle()
  expect(answer.text).toBe('1 still running: Session · Test and validate local agent environment. Stopping leaves them running, with nothing watching them. Run /master-session:stop force to stop anyway.')
  expect(answer.context).toBeUndefined()
  expect((await atomsOf($)).board).not.toBeNull()
  expect((await atomsOf($)).role).toMatchObject({ role: 'master' })
  expect(run.gits.length - gits).toBe(0)
  expect([run.calls.length - before, run.writes.length, run.closed.length, run.opened.length - opened, run.toasts.length]).toEqual([0, 0, 0, 0, 0])
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await altsOf(band)).length).toBeGreaterThan(0)
  await band.unmount()
})

test('AC4 only force stops: repeated stop at once and 60 s later changes nothing', WITH, async ($, on) => {
  const run = await master($, on, ONLY_WORKING)
  const first = (await $.command.run(typed(STOP, ''))).text
  await run.clock.advance(60_000)
  const later = (await $.command.run(typed(STOP, ''))).text
  expect(first).toMatch(/still running/)
  expect(later).toMatch(/still running/)
  expect((await atomsOf($)).board).not.toBeNull()
  expect((await atomsOf($)).role).toMatchObject({ role: 'master' })
  expect(run.writes.filter(one => JSON.parse(one.text).kind === 'stopped')).toEqual([])
})

test('AC5 stop force stops a master with Working rows', WITH, async ($, on) => {
  const run = await master($, on, ONLY_WORKING)
  await $.command.run(typed(STOP, ''))
  const shown = [run.opened.length, run.toasts.length]
  const answer = await $.command.run(typed(STOP, 'force'))
  expect(answer.text).toBe(M3)
  expect(answer.context).toEqual([C1])
  expect(run.writes.map(one => one.path)).toEqual([OWN])
  expect([run.opened.length, run.toasts.length]).toEqual(shown)
  expect((await atomsOf($)).board).toBeNull()
  expect((await atomsOf($)).stopped).toBe(true)
  expect(run.closed).toEqual([PANE.requestId])
})

test('AC6 a master with no Working row stops at once with M3', WITH, async ($, on) => {
  const run = await master($, on)
  const shown = [run.opened.length, run.toasts.length]
  const answer = await $.command.run(typed(STOP, ''))
  expect(answer.text).toBe(M3)
  expect((await atomsOf($)).board).toBeNull()
  expect(run.closed.length).toBe(1)
  expect([run.opened.length, run.toasts.length]).toEqual(shown)
})

test('AC8 a master stops: board null, role empty, stopped true, isPlan unchanged', WITH, async ($, on) => {
  const run = await master($, on)
  await $.classic.UserPromptSubmit({ prompt: 'go', permission_mode: 'plan' } as never)
  await $.command.run(typed(STOP, ''))
  await run.clock.settle()
  expect((await atomsOf($)).isPlan).toBe(true)
  expect((await atomsOf($)).board).toBeNull()
  expect((await atomsOf($)).role).toEqual({ role: '', self: '', parent: '' })
  expect((await atomsOf($)).stopped).toBe(true)
})

test('AC9 a master stops with exactly one write: its own board tombstone', async ($, on) => {
  const run = await stopped($, on)
  expect(run.writes.map(one => one.path)).toEqual([OWN])
  expect(JSON.parse(run.writes[0]?.text ?? '')).toMatchObject({ v: 1, kind: 'stopped', session: SELF })
  expect(typeof JSON.parse(run.writes[0]?.text ?? '').at).toBe('number')
})

test('AC10 the mounted band goes empty after the stop and a fresh mount draws nothing', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const run = await master($, on)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await altsOf(band)).length).toBeGreaterThan(0)
  await $.command.run(typed(STOP, ''))
  await run.clock.settle()
  expect(await altsOf(band)).toEqual([])
  await band.unmount()
  const fresh = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await altsOf(fresh)).toEqual([])
  await fresh.unmount()
})

test('AC11 the open pane is closed once, a closed pane is not closed', async ($, on) => {
  const open = await master($, on)
  await $.command.run(typed(STOP, ''))
  expect(open.closed).toEqual(['master-session'])
})

test('AC11 a closed pane gets no ui.close', async ($, on) => {
  const run = await stopped($, on, BOARD, { isPaneOpen: false })
  expect(run.closed).toEqual([])
})

test('AC12 the answer is M3 and the context holds C1 alone', async ($, on) => {
  const run = await stopped($, on)
  expect(run.answer.text).toBe(M3)
  expect(run.answer.context).toEqual([C1])
})

test('AC13 a stop makes no mcp call and no process.run, in default mode', async ($, on) => {
  const plain = await master($, on)
  const calls = plain.calls.length
  const gits = plain.gits.length
  await $.command.run(typed(STOP, ''))
  expect([plain.calls.length - calls, plain.gits.length - gits]).toEqual([0, 0])
})

test('AC13 a stop in plan mode makes no mcp call and no process.run', async ($, on) => {
  const run = await master($, on)
  await $.classic.UserPromptSubmit({ prompt: 'go', permission_mode: 'plan' } as never)
  await run.clock.settle()
  const calls = run.calls.length
  const gits = run.gits.length
  await $.command.run(typed(STOP, ''))
  expect([run.calls.length - calls, run.gits.length - gits]).toEqual([0, 0])
})

test('AC14 after the stop the clock advances with no call, run, write or transcript read', async ($, on) => {
  const run = await stopped($, on)
  const before = [run.calls.length, run.gits.length, run.writes.length, run.scans.messages]
  await run.clock.advance(120_000)
  expect([run.calls.length, run.gits.length, run.writes.length, run.scans.messages]).toEqual(before)
})

test('AC15 a stop leaves the workers’ report files alone', async ($, on) => {
  const report = JSON.stringify({ v: 1, kind: 'status', session: 'local_env', parent: SELF, seq: 1, at: 3_590_000, run: { isRunning: true }, modelAt: 3_590_000, state: 'working', activity: [], commits: [], tests: [], files: [] })
  const run = await master($, on, BOARD, { files: { [reportPath(HOME, 'local_env')]: report, [reportPath(HOME, 'local_setup')]: report.replace('local_env', 'local_setup') } })
  const gits = run.gits.length
  await $.command.run(typed(STOP, ''))
  await run.clock.settle()
  expect(run.writes.map(one => one.path)).toEqual([OWN])
  expect(run.gits.slice(gits)).toEqual([])
})

test('AC16 a stopped master’s board call denies with M5 and publishes nothing', WITH, async ($, on) => {
  engineBand(on)
  const run = await stopped($, on)
  const answer = (await $.tool.call({ tool: BOARD_TOOL, ...BOARD })) as { deny?: string }
  await run.clock.settle()
  expect(answer.deny).toBe(M5)
  expect((await atomsOf($)).board).toBeNull()
  expect(run.writes).toHaveLength(1)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await altsOf(band)).toEqual([])
  await band.unmount()
})

test('AC17 a stopped master’s reports call denies with M5 and reads nothing', async ($, on) => {
  const hits: string[] = []
  const watched = new Proxy({ [reportPath(HOME, 'local_env')]: '{}' } as Record<string, string>, {
    get: (target, key) => (typeof key === 'string' && key.includes('/.claude/state/') && hits.push(key), target[key as string]),
    has: (target, key) => (typeof key === 'string' && key.includes('/.claude/state/') && hits.push(key), key in target),
    ownKeys: target => (hits.push('list'), Reflect.ownKeys(target)),
  })
  const run = await stopped($, on, BOARD, { files: watched })
  const calls = run.calls.length
  hits.length = 0
  const answer = (await $.tool.call({ tool: REPORTS })) as { deny?: string }
  expect(answer.deny).toBe(M5)
  expect(run.calls.length - calls).toBe(0)
  expect(hits).toEqual([])
})

test('AC18 a stopped master’s info and open answer M5', async ($, on) => {
  const run = await stopped($, on)
  const calls = run.calls.length
  const opened = run.opened.length
  expect((await $.command.run(typed('master-session:info', ''))).text).toBe(M5)
  expect(((await $.tool.call({ tool: OPEN })) as { deny?: string }).deny).toBe(M5)
  expect([run.calls.length - calls, run.opened.length - opened, run.scans.messages]).toEqual([0, 0, 0])
})

test('AC19 a stopped master whose transcript holds board calls stays plain after a turn', WITH, async ($, on) => {
  const run = await stopped($, on)
  const reads = run.scans.messages
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await run.clock.advance(30_000)
  expect((await atomsOf($)).board).toBeNull()
  expect(run.scans.messages).toBe(reads)
})

test('AC33 a stopped master’s pane draws only M5 and calls nothing', async ($, on) => {
  const run = await stopped($, on)
  const calls = run.calls.length
  const gits = run.gits.length
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await textsOf(pane)).filter(Boolean)).toEqual([M5])
  await pane.unmount()
  expect([run.calls.length - calls, run.gits.length - gits]).toEqual([0, 0])
})

async function reloaded($: Engine, on: On, isPlan = false) {
  engineBand(on)
  const run = await master($, on)
  if (isPlan) await $.classic.UserPromptSubmit({ prompt: 'go', permission_mode: 'plan' } as never)
  await $.command.run(typed(STOP, ''))
  await run.clock.settle()
  const tools = run.tools.length
  const calls = run.calls.length
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  return { ...run, added: run.tools.slice(tools), calls0: calls }
}

test('AC20 a reload keeps the stop: state stays, only open board scroll register, nothing runs', WITH, async ($, on) => {
  const run = await reloaded($, on)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await altsOf(band)).toEqual([])
  await band.unmount()
  expect((await atomsOf($)).board).toBeNull()
  expect((await atomsOf($)).role).toEqual({ role: '', self: '', parent: '' })
  expect((await atomsOf($)).stopped).toBe(true)
  expect(run.added).toEqual(['open', 'board', 'scroll'])
  const before = [run.calls.length, run.gits.length, run.writes.length, run.scans.messages]
  await run.clock.advance(120_000)
  expect([run.calls.length, run.gits.length, run.writes.length, run.scans.messages]).toEqual(before)
  expect(run.calls.length).toBe(run.calls0)
})

test('AC21 a reload in plan mode makes no session lookup and keeps isPlan', WITH, async ($, on) => {
  const run = await reloaded($, on, true)
  const lookups = () => run.calls.filter(one => one.tool === 'get_session' || one.tool === 'list_sessions').length
  const before = lookups()
  await run.clock.advance(120_000)
  expect(lookups()).toBe(before)
  expect(run.calls.length).toBe(run.calls0)
  expect((await atomsOf($)).isPlan).toBe(true)
  expect((await atomsOf($)).stopped).toBe(true)
})

test('AC22 after a reload reports, report and open deny', async ($, on) => {
  const run = await reloaded($, on)
  const call = async (tool: typeof REPORTS | typeof REPORT | typeof OPEN) => ((await $.tool.call({ tool })) as { deny?: string }).deny
  expect(await call(REPORTS)).toBe(M5)
  expect(await call(REPORT)).toBe(NO_MASTER)
  expect(await call(OPEN)).toBe(M5)
  expect(run.calls.length).toBe(run.calls0)
})

test('AC23 /master-session:start makes a stopped master publish again', WITH, async ($, on) => {
  const run = await stopped($, on)
  await $.skill.prompt(START)
  await run.clock.settle()
  expect((await atomsOf($)).stopped).toBe(false)
  expect((await atomsOf($)).role).toMatchObject({ role: 'master', self: SELF })
  const answer = (await $.tool.call({ tool: BOARD_TOOL, ...BOARD })) as { deny?: string }
  await run.clock.settle()
  expect(answer.deny).toBeUndefined()
  const last = run.writes.filter(one => one.path === OWN).at(-1)
  expect(JSON.parse(last?.text ?? '').kind).toBe('board')
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await altsOf(band)).length).toBeGreaterThan(0)
  await band.unmount()
})

test('AC24 a restarted master survives a hot reload', WITH, async ($, on) => {
  const run = await stopped($, on)
  await $.skill.prompt(START)
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await run.clock.settle()
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  expect((await atomsOf($)).board).not.toBeNull()
  expect((await atomsOf($)).stopped).toBe(false)
})

test('AC25 a stop with workers names no worker in any call', async ($, on) => {
  const run = await master($, on)
  const before = run.calls.length
  await $.command.run(typed(STOP, ''))
  await run.clock.settle()
  expect(run.calls.slice(before)).toEqual([])
})

test('AC26 a briefed worker stays a worker when its parent board becomes the tombstone', async ($, on) => {
  const run = await worker($, on)
  const file = boardPath(HOME, MASTER)
  const tomb = JSON.stringify({ v: 1, kind: 'stopped', session: MASTER, at: 1 })
  files[file] = tomb
  const answer = (await $.tool.call({ tool: REPORT, state: 'working' })) as { result?: string }
  expect(answer.result).toMatch(/^ok #\d+$/)
  expect(run.writes.some(one => one.path === reportPath(HOME, 'local_worker'))).toBe(true)
})

test('AC27 a child that engages after the parent board became the tombstone is no worker', async ($, on) => {
  const rec = recorders(on)
  const tomb = JSON.stringify({ v: 1, kind: 'stopped', session: MASTER, at: 1 })
  const run = world(on, { parent: MASTER, files: { [boardPath(HOME, MASTER)]: tomb } })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  const answer = (await $.tool.call({ tool: REPORT, state: 'working' })) as { deny?: string }
  expect(answer.deny).toBe(NO_MASTER)
  expect(run.tools).not.toContain('report')
  expect(rec.writes.map(one => one.path)).not.toContain(reportPath(HOME, 'local_worker'))
  expect((await $.command.run(typed('master-session:info', 'x'))).text).not.toMatch(/worker session/)
})

test('AC28 a child whose parent board is anything but the tombstone becomes a worker', async ($, on) => {
  const run = await worker($, on)
  expect(run.tools).toContain('report')
  expect(run.writes.some(one => one.path === reportPath(HOME, 'local_worker'))).toBe(true)
})

test('AC29 a briefed worker stops: M4, C2, role empty, one tombstone write, no mcp call', WITH, async ($, on) => {
  const run = await worker($, on)
  const calls = run.calls.length
  run.writes.length = 0
  const answer = await $.command.run(typed(STOP, ''))
  await run.clock.settle()
  expect(answer.text).toBe(M4)
  expect(answer.context).toEqual([C2])
  expect((await atomsOf($)).role).toEqual({ role: '', self: '', parent: '' })
  expect((await atomsOf($)).stopped).toBe(true)
  expect(run.writes.map(one => one.path)).toEqual([reportPath(HOME, 'local_worker')])
  expect(JSON.parse(run.writes[0]?.text ?? '').kind).toBe('stopped')
  expect(run.calls.length - calls).toBe(0)
})

test('AC30 a stopped worker’s report call denies and nothing is written', async ($, on) => {
  const run = await worker($, on)
  await $.command.run(typed(STOP, ''))
  run.writes.length = 0
  const answer = (await $.tool.call({ tool: REPORT, state: 'working' })) as { deny?: string }
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never).catch(() => undefined)
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await run.clock.settle()
  expect(answer.deny).toBe(NO_MASTER)
  expect(run.writes).toEqual([])
})

test('AC30 a report write in flight when the worker stops never lands after its tombstone', async ($, on) => {
  const run = await worker($, on, { git: 5_000 })
  run.writes.length = 0
  const ended = $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await run.clock.advance(1_000)
  expect(run.gits.length).toBeGreaterThan(0)
  await $.command.run(typed(STOP, ''))
  await run.clock.advance(10_000)
  await ended
  expect(run.writes.map(one => JSON.parse(one.text).kind)).toEqual(['stopped'])
})

test('AC31 a master drops a report whose file became the tombstone, its row stays', WITH, async ($, on) => {
  const path = reportPath(HOME, 'local_env')
  const report = JSON.stringify({ v: 1, kind: 'status', session: 'local_env', parent: SELF, seq: 1, at: 3_590_000, run: { isRunning: true }, modelAt: 3_590_000, state: 'working', activity: [], commits: [], tests: [], files: [] })
  const own: Record<string, string> = { [path]: report }
  const run = await master($, on, BOARD, { files: own })
  await run.clock.advance(3_000)
  expect((await atomsOf($)).reports.map(one => one.session)).toContain('local_env')
  own[path] = JSON.stringify({ v: 1, kind: 'stopped', session: 'local_env', at: 3_700_000 })
  await run.clock.advance(3_000)
  expect((await atomsOf($)).reports.map(one => one.session)).not.toContain('local_env')
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await textsOf(pane)).join(' ')).toContain('Test and validate local agent environment')
  await pane.unmount()
})

test('AC31 a master’s reports view drops its own board once that file is the tombstone', async ($, on) => {
  const report = JSON.stringify({ v: 1, kind: 'status', session: 'local_env', parent: 'local_other', seq: 1, at: 3_590_000, run: { isRunning: true }, modelAt: 3_590_000, state: 'working', activity: [], commits: [], tests: [], files: [] })
  const own: Record<string, string> = { [OWN]: JSON.stringify({ v: 1, kind: 'board', at: 3_590_000, masterId: SELF, board: BOARD }), [reportPath(HOME, 'local_env')]: report }
  const run = await master($, on, BOARD, { files: own })
  const view = async () => ((await $.tool.call({ tool: REPORTS })) as { result?: string }).result ?? ''
  expect(await view()).toContain('local_env')
  own[OWN] = JSON.stringify({ v: 1, kind: 'stopped', session: SELF, at: 3_700_000 })
  await run.clock.advance(3_000)
  expect(await view()).not.toContain('local_env')
})

test('AC32 a stopped worker stays plain across a reload and an engage, the worker skill re-enables it', WITH, async ($, on) => {
  const run = await worker($, on)
  await $.command.run(typed(STOP, ''))
  run.writes.length = 0
  const calls = run.calls.length
  const tools = run.tools.length
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.tool.call({ tool: REPORT, state: 'working' })
  expect([run.calls.length - calls, run.writes.length, run.tools.slice(tools)]).toEqual([0, 0, ['open', 'board', 'scroll']])
  await $.skill.prompt(WORKER)
  await run.clock.settle()
  expect((await atomsOf($)).stopped).toBe(false)
  expect(run.tools).toContain('report')
})

test('AC23 stop then start with the same empty board writes the board file again', async ($, on) => {
  const rec = recorders(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.skill.prompt(START)
  await run.clock.settle()
  expect((await $.command.run(typed(STOP, 'force'))).text).toBe(M3)
  await run.clock.settle()
  rec.writes.length = 0
  await $.skill.prompt(START)
  await run.clock.settle()
  const last = rec.writes.filter(one => one.path === OWN).at(-1)
  expect(JSON.parse(last?.text ?? '{}')).toMatchObject({ v: 1, kind: 'board', masterId: SELF })
})

test('a stop answered while the worker detection is in flight waits for it and stops the worker', async ($, on) => {
  const rec = recorders(on)
  const run = world(on, childOf(3_600_000))
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  void $.tool.call({ tool: REPORT, state: 'working' })
  const answer = await $.command.run(typed(STOP, ''))
  await run.clock.settle()
  expect(answer.text).toBe(M4)
  expect(rec.writes.at(-1)?.path).toBe(reportPath(HOME, 'local_worker'))
  expect(JSON.parse(rec.writes.at(-1)?.text ?? '{}').kind).toBe('stopped')
})

test('a master whose board file cannot be retired says so and still stops', WITH, async ($, on) => {
  const run = await master($, on)
  failing = true
  const answer = await $.command.run(typed(STOP, ''))
  expect(answer.text).toBe(`${M3} The board file could not be cleared; a worker started now may still take this session as its master.`)
  expect(answer.context).toEqual([C1])
  expect((await atomsOf($)).stopped).toBe(true)
  expect(run.writes).toEqual([])
})

test('a worker whose report file cannot be retired says so and still stops', async ($, on) => {
  await worker($, on)
  failing = true
  const answer = await $.command.run(typed(STOP, ''))
  expect(answer.text).toBe(`${M4} The report file could not be cleared; the master may still show this session's last report.`)
  expect(answer.context).toEqual([C2])
})

test('AC23 a stopped master given the worker skill prompt rewrites its board file on the same board', async ($, on) => {
  const run = await stopped($, on)
  await $.skill.prompt(WORKER)
  await run.clock.settle()
  run.writes.length = 0
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await run.clock.settle()
  const last = run.writes.filter(one => one.path === OWN).at(-1)
  expect(JSON.parse(last?.text ?? '{}')).toMatchObject({ v: 1, kind: 'board', masterId: SELF })
})
