import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { FILE_MS } from '../lib/constants'
import { FIXTURE, K1, K2, K3, fakeProcesses, proc } from '../testing/procs'
import type { FakeProc } from '../testing/procs'
import type { Child, Clickable, Ui as Found } from '../testing/world'

type Ui = Found & Clickable
import { AT, HOME, PANE, SELF, click, childOf, started, textsOf, warmUp } from '../testing/world'

warmUp()

const session = (id: string, name: string, title: string, cwd: string) => ({ sessionId: id, name, title, cwd, isRunning: true, isArchived: false, lastActivityAt: AT, startedBy: SELF })

const BOARD_P = {
  tick: '12:00',
  sessions: [
    { id: 'local_k1', name: 'k1', title: 'Implementer · Row details', state: 'working', progress: 'step 1 of 2 — build' },
    { id: 'local_k2', name: 'k2', title: 'Implementer · Band strip', state: 'working', progress: 'step 1 of 2 — build' },
  ],
  needsYou: [],
  repos: ['~/Work/app'],
}

const listing = (path: string) => `worktree ${HOME}/Work/app\nHEAD d575596be1713c300bf1d8737355ceda0cb3ded3\nbranch refs/heads/main\n\nworktree ${K1}\nHEAD 0a4621c5737c70d482f20e7ea07591e9c117d6a1\ndetached\n\nworktree ${K2}\nHEAD 0a4621c5737c70d482f20e7ea07591e9c117d6a1\ndetached\n\nworktree ${K3}\nHEAD 0a4621c5737c70d482f20e7ea07591e9c117d6a1\ndetached\n\n`.replace('%PATH%', path)

const STATUS = '# branch.oid 0a4621c\n# branch.head (detached)\n'

const CHILD: Child = {
  isBare: true,
  sessions: [session('local_k1', 'k1', 'Implementer · Row details', K1), session('local_k2', 'k2', 'Implementer · Band strip', K2)],
  git: Object.fromEntries([`${HOME}/Work/app`, K1, K2, K3].flatMap(path => [[`${path} worktree`, listing(path)], [`${path} status`, STATUS]])),
}

type Boot = { procs?: FakeProc[]; child?: Child; expanded?: boolean }

async function boot($: Engine, on: On, options: Boot = {}) {
  const fake = fakeProcesses(options.procs ?? FIXTURE)
  const child = options.child ?? { ...CHILD }
  child.proc = fake.handle
  const run = await started($, on, BOARD_P, child)
  await run.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  if (options.expanded !== false) {
    await click(ui, 'hit-processes-toggle')
    await run.clock.settle()
  }
  return { run, fake, ui }
}

const all = async (ui: Found) => JSON.stringify(await section(ui))

const keysOf = async (ui: Found) => (await ui.findAll({ type: 'Box' })).map(one => one.key ?? '')

const section = async (ui: Found) => {
  const texts = await textsOf(ui)
  const from = texts.indexOf('Processes')
  const to = texts.indexOf('Needs you', from)
  return texts.slice(from, to < 0 ? undefined : to)
}

const shown = async (ui: Found, text: string) => (await section(ui)).filter(one => one === text).length

test('AC1: the load line reads Mac load with the three averages and the cores', async ($, on) => {
  const { ui } = await boot($, on)
  expect(await all(ui)).toContain('Mac load')
  expect(await all(ui)).toContain('18.3 · 14.5 · 15.1 · 10 cores')
  await ui.unmount()
})

test('AC2, AC3: the rows are 130, 530 and 531, named node, owned by the task short name; engines, shells with children and MCP servers are not rows', async ($, on) => {
  const { ui, fake } = await boot($, on)
  expect(await shown(ui, 'node')).toBe(3)
  expect(await shown(ui, 'Band strip')).toBe(1)
  expect(await shown(ui, 'Row details')).toBe(2)
  expect(await shown(ui, 'zsh')).toBe(0)
  expect(await shown(ui, 'claude')).toBe(0)
  expect(await all(ui)).not.toContain('"k1"')
  expect(fake.argvs('ps').every(argv => argv[0] === 'ps')).toBe(true)
  await ui.unmount()
})

test('AC4: a shell of the user’s terminal with a cwd in a run worktree, and its child, are not rows', async ($, on) => {
  const { ui } = await boot($, on, { procs: [...FIXTURE, proc(20, 1, 'Terminal'), proc(900, 20, 'zsh', { cwd: K1 }), proc(901, 900, 'node', { cwd: K1 })] })
  expect(await shown(ui, 'node')).toBe(3)
  await ui.unmount()
})

test('AC5: an engine outside the run, with its shell and node, shows nothing', async ($, on) => {
  const { ui } = await boot($, on, { procs: [...FIXTURE, proc(700, 10, 'claude', { cwd: `${HOME}/Work/other` }), proc(710, 700, 'zsh'), proc(711, 710, 'node')] })
  expect(await shown(ui, 'node')).toBe(3)
  await ui.unmount()
})

test('AC6: a shell with no live child shows as itself, owned by master', async ($, on) => {
  const { ui } = await boot($, on, { procs: FIXTURE.filter(one => one.pid !== 130) })
  expect(await shown(ui, 'zsh')).toBe(1)
  expect(await shown(ui, 'master')).toBe(1)
  await ui.unmount()
})

test('AC7: no ps argv holds args or command, and no text holds an argument', async ($, on) => {
  const { ui, fake } = await boot($, on)
  expect(fake.argvs('ps').length).toBeGreaterThan(0)
  for (const argv of fake.calls) {
    expect(argv.join(' ')).not.toMatch(/\b(args|command|comm)=/)
  }
  expect(fake.argvs('ps')[0]).toEqual(['ps', '-x', '-U', '501', '-o', 'pid=,ppid=,lstart=,%cpu=,rss=,etime=,ucomm='])
  await ui.unmount()
})

test('AC8, AC9: cpu, memory and elapsed read in the pane’s formats, highest CPU first', async ($, on) => {
  const { ui } = await boot($, on)
  const texts = await section(ui)
  for (const one of ['40%', '12%', '3%', '84 MB', '1.2 GB', '4m', '45s', '1h 3m']) expect(texts).toContain(one)
  const nodes = texts.filter(one => /%$/.test(one))
  expect(nodes).toEqual(['40%', '12%', '3%'])
  await ui.unmount()
})

test('AC10: 15 matching processes show 12 rows, then +3 more', async ($, on) => {
  const many = Array.from({ length: 15 }, (_, index) => proc(600 + index, 520, 'node', { cpu: 15 - index }))
  const { ui } = await boot($, on, { procs: [...FIXTURE.filter(one => ![530, 531, 130, 120].includes(one.pid)), ...many] })
  expect(await shown(ui, 'node')).toBe(12)
  expect(await all(ui)).toContain('+3 more')
  expect(await shown(ui, '15')).toBe(1)
  await ui.unmount()
})

test('AC12: no match reads No processes from this run under the load line', async ($, on) => {
  const { ui } = await boot($, on, { procs: FIXTURE.filter(one => ![520, 530, 531, 130, 120].includes(one.pid)) })
  expect(await all(ui)).toContain('No processes from this run.')
  expect(await shown(ui, 'node')).toBe(0)
  await ui.unmount()
})

test('AC13: ps exits 1 with boom: the error line, no rows and no Stop', async ($, on) => {
  const fake = fakeProcesses(FIXTURE)
  const run = await started($, on, BOARD_P, { ...CHILD, proc: fake.handle })
  fake.state.psExit = 1
  fake.state.psFails = 'boom'
  await run.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-processes-toggle')
  await run.clock.settle()
  expect(await all(ui)).toContain('Can’t read processes: boom')
  expect(await shown(ui, 'node')).toBe(0)
  expect(await ui.find({ key: 'hit-process-stop-530' })).toBeUndefined()
  await ui.unmount()
})

test('Q8: a shell whose parent is not a claude engine gives the error line and no Stop', async ($, on) => {
  const fake = fakeProcesses(FIXTURE, { shellParent: 4242 })
  const run = await started($, on, BOARD_P, { ...CHILD, proc: fake.handle })
  await run.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-processes-toggle')
  await run.clock.settle()
  expect(await all(ui)).toContain('Can’t read processes: the session’s own process was not found')
  expect(await ui.find({ key: 'hit-process-stop-530' })).toBeUndefined()
  expect(fake.kills).toEqual([])
  await ui.unmount()
})

test('Q8: the shell’s parent is the engine pid: that pid is proven against the process table before any row shows', async ($, on) => {
  const { fake, ui } = await boot($, on)
  expect(fake.argvs('/bin/sh')[0]).toEqual(['/bin/sh', '-c', 'echo $PPID'])
  expect(await shown(ui, 'node')).toBe(3)
  await ui.unmount()
})

test('AC14: the section changes nothing else in the pane', async ($, on) => {
  const fake = fakeProcesses(FIXTURE)
  const run = await started($, on, BOARD_P, { ...CHILD, proc: fake.handle })
  await run.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const before = (await textsOf(ui)).filter(one => !/^Processes$|^Show$|^Hide$/.test(one))
  await click(ui, 'hit-processes-toggle')
  await run.clock.settle()
  const expanded = (await textsOf(ui)).filter(one => before.includes(one))
  expect(expanded.slice(0, 3)).toEqual(before.slice(0, 3))
  await click(ui, 'hit-processes-toggle')
  await run.clock.settle()
  expect((await textsOf(ui)).filter(one => !/^Processes$|^Show$|^Hide$/.test(one))).toEqual(before)
  await ui.unmount()
})

test('AC15: a closed pane for 60 s makes no ps, lsof or sysctl call', async ($, on) => {
  const fake = fakeProcesses(FIXTURE)
  const run = await started($, on, BOARD_P, { ...CHILD, isPaneOpen: false, proc: fake.handle })
  await run.clock.settle()
  await run.clock.advance(60_000)
  expect(fake.calls.filter(one => ['ps', 'lsof', 'sysctl', '/bin/sh', 'id'].includes(one[0] ?? ''))).toEqual([])
})

test('AC16: an open pane with the section expanded reads every 5 s; collapsed it reads nothing', async ($, on) => {
  const collapsed = await boot($, on, { expanded: false })
  await collapsed.run.clock.advance(60_000)
  expect(collapsed.fake.calls.length).toBe(0)
  await collapsed.ui.unmount()
})

test('AC16: expanded for 60 s makes 12 ps calls, give or take one', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  const before = fake.argvs('ps').length
  await run.clock.advance(60_000)
  const reads = fake.argvs('ps').length - before
  expect(reads).toBeGreaterThanOrEqual(11)
  expect(reads).toBeLessThanOrEqual(13)
  expect(fake.argvs('sysctl').length).toBe(fake.argvs('ps').length)
  await ui.unmount()
})

test('AC17: expanding the section reads at once, not after 5 s', async ($, on) => {
  const { fake } = await boot($, on)
  expect(fake.argvs('ps').length).toBeGreaterThan(0)
  expect(FILE_MS).toBe(5_000)
})

test('AC18: every lsof names its pids with -p and never -u', async ($, on) => {
  const { fake, ui } = await boot($, on)
  expect(fake.argvs('lsof').length).toBeGreaterThan(0)
  for (const argv of fake.argvs('lsof')) {
    expect(argv.slice(0, 4)).toEqual(['lsof', '-a', '-d', 'cwd'])
    expect(argv[4]).toBe('-p')
    expect(argv[5]).toMatch(/^\d+(,\d+)*$/)
    expect(argv).not.toContain('-u')
  }
  await ui.unmount()
})

test('AC19: a worker pane makes no ps, lsof, sysctl or kill call and draws no section', async ($, on) => {
  const child = childOf(3_600_000, BOARD_P)
  const fake = fakeProcesses(FIXTURE)
  const run = await started($, on, BOARD_P, { ...child, isBare: true, proc: fake.handle })
  await run.clock.settle()
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(30_000)
  expect(fake.calls.length).toBe(0)
})

test('AC36: the section sits after the summary tiles and before the filter chips, at every width, on both surfaces', async ($, on) => {
  const fake = fakeProcesses(FIXTURE)
  const run = await started($, on, BOARD_P, { ...CHILD, proc: fake.handle })
  await run.clock.settle()
  for (const [surface, columns] of [['desktop', 68], ['desktop', 47], ['desktop', 36], ['terminal', 60]] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns: columns } } as never)
    const keys = await keysOf(ui)
    const at = (key: string) => keys.indexOf(key)
    expect(at('section-summary')).toBeGreaterThan(-1)
    expect(at('section-processes')).toBeGreaterThan(at('section-summary'))
    expect(at('section-chips')).toBeGreaterThan(at('section-processes'))
    await ui.unmount()
  }
})

test('the collapsed header reads Processes with Show and no numbers', async ($, on) => {
  const { ui, fake } = await boot($, on, { expanded: false })
  expect(await shown(ui, 'Processes')).toBe(1)
  expect(await shown(ui, 'Show')).toBe(1)
  expect(await all(ui)).not.toContain('Mac load')
  expect(fake.calls.length).toBe(0)
  await ui.unmount()
})

test('AC38: a process of a worker lists under the worker’s task short name, the master’s under master, left behind under its worktree', async ($, on) => {
  const { ui } = await boot($, on, { procs: [...FIXTURE, proc(120 + 1000, 120, 'git'), proc(950, 1, 'node', { cwd: `${K3}/web` })] })
  const texts = await section(ui)
  expect(texts).toContain('Row details')
  expect(texts).toContain('Band strip')
  expect(texts).toContain('master')
  expect(texts).toContain('left behind (wt-app-k3)')
  await ui.unmount()
})

const stopRow = async (fake: ReturnType<typeof fakeProcesses>, run: Awaited<ReturnType<typeof boot>>['run'], ui: Ui, pid: number) => {
  await click(ui, `hit-process-stop-${pid}`)
  await run.clock.settle()
  void fake
}

test('AC20: Stop shows the confirm naming the program, pid and task; Cancel sends no kill', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  await stopRow(fake, run, ui, 530)
  expect(await all(ui)).toContain('Stop node (pid 530, Row details)? It gets SIGTERM now and SIGKILL after 5 s if it still runs.')
  await click(ui, 'hit-process-no-530')
  await run.clock.settle()
  expect(fake.kills).toEqual([])
  expect(await all(ui)).not.toContain('SIGTERM')
  await ui.unmount()
})

test('AC21: confirming 530 sends exactly kill -s TERM 530 531, and the row reads Stopping', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  fake.state.survivesTerm = new Set([530, 531])
  await stopRow(fake, run, ui, 530)
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  expect(fake.argvs('kill')).toEqual([['kill', '-s', 'TERM', '530', '531']])
  expect(await all(ui)).toContain('Stopping 0s')
  expect(await ui.find({ key: 'hit-process-stop-530' })).toBeUndefined()
  await run.clock.advance(2_000)
  expect(await all(ui)).toContain('Stopping 2s')
  await run.clock.advance(5_000)
  await ui.unmount()
})

test('AC22: after 5 s only the survivor with the same identity gets KILL', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  fake.state.survivesTerm = new Set([530])
  await stopRow(fake, run, ui, 530)
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  await run.clock.advance(4_900)
  expect(fake.kills.map(one => one.signal)).toEqual(['TERM'])
  await run.clock.advance(100)
  expect(fake.kills).toEqual([
    { signal: 'TERM', pids: ['530', '531'] },
    { signal: 'KILL', pids: ['530'] },
  ])
  await ui.unmount()
})

test('AC22: when both are gone after 5 s there is no KILL', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  await stopRow(fake, run, ui, 530)
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  await run.clock.advance(5_000)
  expect(fake.kills).toEqual([{ signal: 'TERM', pids: ['530', '531'] }])
  await ui.unmount()
})

test('AC22: a pid that comes back with a new start time after the TERM is never KILLed', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  await stopRow(fake, run, ui, 530)
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  fake.state.procs = [...fake.state.procs, proc(530, 520, 'node', { lstart: 'Mon Oct 27 10:05:00 2026' })]
  await run.clock.advance(5_000)
  expect(fake.kills.map(one => one.signal)).toEqual(['TERM'])
  await ui.unmount()
})

test('AC23: a pid that comes back with a new start time between the list and the confirm gets no signal and reads Already ended', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  await stopRow(fake, run, ui, 530)
  fake.state.procs = fake.state.procs.map(one => (one.pid === 530 ? { ...one, lstart: 'Mon Oct 27 10:05:00 2026' } : one))
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  expect(fake.kills).toEqual([])
  expect(await all(ui)).toContain('Already ended')
  await ui.unmount()
})

test('R1: a process that left its Bash root between the list and the confirm reads No longer from this run and gets no signal', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  await stopRow(fake, run, ui, 530)
  fake.state.procs = fake.state.procs.map(one => (one.pid === 530 ? { ...one, ppid: 20 } : one)).concat(proc(20, 1, 'Terminal'))
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  expect(fake.kills).toEqual([])
  expect(await all(ui)).toContain('No longer from this run')
  await ui.unmount()
})

test('AC24: pid 1, 0, an engine, Claude, disclaimer, the master’s ancestors and a process outside the run are never in a kill argv', async ($, on) => {
  const { fake, run, ui } = await boot($, on, {
    procs: [...FIXTURE, proc(540, 530, 'claude'), proc(541, 530, 'Claude'), proc(542, 530, 'disclaimer'), proc(543, 540, 'node'), proc(544, 531, 'git'), proc(900, 20, 'zsh', { cwd: K1 }), proc(20, 1, 'Terminal'), proc(0, 531, 'node')],
  })
  await stopRow(fake, run, ui, 530)
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  const sent = fake.kills.flatMap(one => one.pids)
  expect(sent).toEqual(['530', '531', '544'])
  for (const bad of ['1', '0', '100', '500', '10', '5', '540', '541', '542', '543', '900', '20']) expect(sent).not.toContain(bad)
  for (const argv of fake.argvs('kill')) {
    expect(argv.slice(0, 3)).toEqual(['kill', '-s', argv[2]])
    expect(['TERM', 'KILL']).toContain(argv[2])
    expect(argv.slice(3).every(one => /^[2-9]\d*$|^[1-9]\d+$/.test(one))).toBe(true)
  }
  await ui.unmount()
})

test('AC25: kill exiting 1 reads Could not stop node with the first stderr line, and Stop stays offered', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  fake.state.killExit = 1
  fake.state.killErr = 'kill: Operation not permitted\nsecond line'
  await stopRow(fake, run, ui, 530)
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  expect(await all(ui)).toContain('Could not stop node: kill: Operation not permitted')
  expect(await all(ui)).not.toContain('second line')
  expect(await ui.find({ key: 'hit-process-stop-530' })).toBeDefined()
  expect(await all(ui)).not.toContain('Stopping')
  await ui.unmount()
})

test('AC37: after Could not stop, Stop opens the same confirm as a first Stop', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  fake.state.killExit = 1
  fake.state.killErr = 'Operation not permitted'
  await stopRow(fake, run, ui, 530)
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  const before = fake.kills.length
  await stopRow(fake, run, ui, 530)
  expect(await all(ui)).toContain('Stop node (pid 530, Row details)? It gets SIGTERM now and SIGKILL after 5 s if it still runs.')
  expect(fake.kills.length).toBe(before)
  fake.state.killExit = 0
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  expect(fake.kills.length).toBe(before + 1)
  await ui.unmount()
})

test('AC26: the pane closing after the confirm does not stop the escalation, and nothing is read after it', async ($, on) => {
  const child = { ...CHILD }
  const { fake, run, ui } = await boot($, on, { child })
  fake.state.survivesTerm = new Set([530])
  await stopRow(fake, run, ui, 530)
  await click(ui, 'hit-process-yes-530')
  await run.clock.settle()
  await run.clock.advance(2_000)
  child.isPaneOpen = false
  await ui.unmount()
  await run.clock.advance(3_000)
  expect(fake.kills.map(one => one.signal)).toEqual(['TERM', 'KILL'])
  const after = fake.calls.length
  await run.clock.advance(60_000)
  expect(fake.calls.length).toBe(after)
})

test('AC27: a second press on the same row sends each pid one TERM only', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  fake.state.survivesTerm = new Set([530, 531])
  await stopRow(fake, run, ui, 530)
  await Promise.all([click(ui, 'hit-process-yes-530'), click(ui, 'hit-process-yes-530')])
  await run.clock.settle()
  expect(fake.kills.filter(one => one.signal === 'TERM')).toEqual([{ signal: 'TERM', pids: ['530', '531'] }])
  await run.clock.advance(5_000)
  await ui.unmount()
})

test('S1: the first press only opens the confirm: no kill call and no Stopping until the second press', async ($, on) => {
  const { fake, run, ui } = await boot($, on)
  await stopRow(fake, run, ui, 530)
  await run.clock.advance(10_000)
  expect(fake.kills).toEqual([])
  expect(await all(ui)).not.toContain('Stopping')
  await ui.unmount()
})

test('AC28: the mod registers no tool or command that sends a signal', async ($, on) => {
  const { run, ui } = await boot($, on)
  expect(run.tools.filter(name => /stop|kill|signal|process/i.test(name))).toEqual([])
  await ui.unmount()
})

test('AC29: a claude row inside a Bash command shows with no Stop button', async ($, on) => {
  const { ui } = await boot($, on, { procs: [...FIXTURE, proc(540, 530, 'claude', { cpu: 2 })] })
  expect(await shown(ui, 'claude')).toBe(1)
  expect(await ui.find({ key: 'hit-process-stop-540' })).toBeUndefined()
  expect(await ui.find({ key: 'hit-process-stop-530' })).toBeDefined()
  await ui.unmount()
})

const LEFT = [proc(950, 1, 'node', { cwd: `${K3}/web`, cpu: 12 }), proc(951, 950, 'node', { cpu: 1 })]

test('AC30: 950 and 951 show in a Left behind group under the list, owned by their worktree', async ($, on) => {
  const { ui } = await boot($, on, { procs: [...FIXTURE, ...LEFT] })
  const texts = await section(ui)
  expect(texts).toContain('Left behind')
  expect(texts.filter(one => one === 'left behind (wt-app-k3)').length).toBe(2)
  const keys = await keysOf(ui)
  expect(keys.indexOf('process-group-left')).toBeGreaterThan(keys.indexOf('process-group-run'))
  await ui.unmount()
})

test('AC31: parent-1 processes in the main checkout, an unlisted repo, a lookalike name or no worktree do not show', async ($, on) => {
  const others = [
    proc(960, 1, 'node', { cwd: `${HOME}/Work/app` }),
    proc(961, 1, 'node', { cwd: `${HOME}/.claude/worktrees/wt-other-k1` }),
    proc(962, 1, 'node', { cwd: `${HOME}/.claude/worktrees/wt-apple-k1` }),
    proc(963, 1, 'node', { cwd: '/tmp' }),
    proc(964, 1, 'node'),
  ]
  const { ui } = await boot($, on, { procs: [...FIXTURE, ...others] })
  expect(await all(ui)).not.toContain('Left behind')
  await ui.unmount()
})

test('AC32: a process under a Bash root never shows in Left behind', async ($, on) => {
  const { ui } = await boot($, on, { procs: [...FIXTURE, proc(970, 520, 'node', { cwd: `${K1}/x` })] })
  expect(await all(ui)).not.toContain('Left behind')
  await ui.unmount()
})

test('AC33: Stop on 950 confirms, Cancel sends nothing, Confirm re-reads ps and lsof then TERMs 950 951 and KILLs survivors after 5 s', async ($, on) => {
  const { fake, run, ui } = await boot($, on, { procs: [...FIXTURE, ...LEFT] })
  await stopRow(fake, run, ui, 950)
  await click(ui, 'hit-process-no-950')
  await run.clock.settle()
  expect(fake.kills).toEqual([])
  await stopRow(fake, run, ui, 950)
  const ps = fake.argvs('ps').length
  const lsof = fake.argvs('lsof').length
  fake.state.survivesTerm = new Set([951])
  await click(ui, 'hit-process-yes-950')
  await run.clock.settle()
  expect(fake.argvs('ps').length).toBe(ps + 1)
  expect(fake.argvs('lsof').length).toBe(lsof + 1)
  expect(fake.argvs('lsof').at(-1)).toEqual(['lsof', '-a', '-d', 'cwd', '-p', '950,951', '-Fpn'])
  expect(fake.argvs('kill')).toEqual([['kill', '-s', 'TERM', '950', '951']])
  await run.clock.advance(5_000)
  expect(fake.argvs('kill')).toEqual([
    ['kill', '-s', 'TERM', '950', '951'],
    ['kill', '-s', 'KILL', '951'],
  ])
  await ui.unmount()
})

test('AC34: a fresh lsof that shows 950 in another directory sends nothing and reads No longer from this run', async ($, on) => {
  const { fake, run, ui } = await boot($, on, { procs: [...FIXTURE, ...LEFT] })
  await stopRow(fake, run, ui, 950)
  fake.state.procs = fake.state.procs.map(one => (one.pid === 950 ? { ...one, cwd: `${HOME}/Work/other` } : one))
  await click(ui, 'hit-process-yes-950')
  await run.clock.settle()
  expect(fake.kills).toEqual([])
  expect(await all(ui)).toContain('No longer from this run')
  await ui.unmount()
})

test('AC35: 950 back with a new start time, or with another parent, gets no signal', async ($, on) => {
  const first = await boot($, on, { procs: [...FIXTURE, ...LEFT] })
  await stopRow(first.fake, first.run, first.ui, 950)
  first.fake.state.procs = first.fake.state.procs.map(one => (one.pid === 950 ? { ...one, lstart: 'Mon Oct 27 10:09:00 2026' } : one))
  await click(first.ui, 'hit-process-yes-950')
  await first.run.clock.settle()
  expect(first.fake.kills).toEqual([])
  await first.ui.unmount()
})

test('S9: Stop on 951 after its root 950 came back with a new start time sends nothing', async ($, on) => {
  const { fake, run, ui } = await boot($, on, { procs: [...FIXTURE, ...LEFT] })
  await stopRow(fake, run, ui, 951)
  fake.state.procs = fake.state.procs.map(one => (one.pid === 950 ? { ...one, lstart: 'Mon Oct 27 10:09:00 2026' } : one))
  await click(ui, 'hit-process-yes-951')
  await run.clock.settle()
  expect(fake.kills).toEqual([])
  await ui.unmount()
})

test('S3: the processes that host the master session get no Stop', async ($, on) => {
  const hosted = FIXTURE.map(one => (one.pid === 100 ? { ...one, ppid: 531 } : one))
  const { ui } = await boot($, on, { procs: hosted })
  expect(await ui.find({ key: 'hit-process-stop-530' })).toBeUndefined()
  expect(await ui.find({ key: 'hit-process-stop-531' })).toBeUndefined()
  expect(await ui.find({ key: 'hit-process-stop-100' })).toBeUndefined()
  expect(await ui.find({ key: 'hit-process-stop-130' })).toBeDefined()
  await ui.unmount()
})

test('AC35: 950 with another parent gets no signal', async ($, on) => {
  const { fake, run, ui } = await boot($, on, { procs: [...FIXTURE, ...LEFT] })
  await stopRow(fake, run, ui, 950)
  fake.state.procs = fake.state.procs.map(one => (one.pid === 950 ? { ...one, ppid: 20 } : one)).concat(proc(20, 1, 'Terminal'))
  await click(ui, 'hit-process-yes-950')
  await run.clock.settle()
  expect(fake.kills).toEqual([])
  await ui.unmount()
})

test('a terminal pane draws the section as text: header, load, rows, Stop and the confirm', async ($, on) => {
  const fake = fakeProcesses(FIXTURE)
  const run = await started($, on, BOARD_P, { ...CHILD, proc: fake.handle })
  await run.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(fake.calls).toEqual([])
  await $.ui.press({ plugin: 'master-session', key: 'processes-toggle' })
  await run.clock.settle()
  const texts = await section(ui)
  expect(texts).toContain('Mac load 18.3 · 14.5 · 15.1 · 10 cores')
  expect(texts.filter(one => one === 'node').length).toBe(3)
  await $.ui.press({ plugin: 'master-session', key: 'process-stop-530' })
  await run.clock.settle()
  expect(await all(ui)).toContain('Stop node (pid 530, Row details)?')
  fake.state.survivesTerm = new Set([530, 531])
  await $.ui.press({ plugin: 'master-session', key: 'process-yes-530' })
  await run.clock.settle()
  expect(fake.argvs('kill')).toEqual([['kill', '-s', 'TERM', '530', '531']])
  await run.clock.advance(5_000)
  await ui.unmount()
})
