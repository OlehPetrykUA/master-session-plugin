import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { reportPath } from './status'
import { BAND, BOARD, BOARD_TOOL, HOME, MASTER, MASTER_TITLE, PANE, SELF, altsOf, childOf, started, textsOf, typed, warmUp, world } from '../testing/world'

warmUp()

const REPORT_TOOL = 'mcp__master-session__report'

async function worker($: Engine, on: On, isPaneOpen = false) {
  on('fs.write', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const run = world(on, { ...childOf(3_600_000), isPaneOpen })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(3_000)
  return run
}

test('a worker draws no band, though its master published a board it could copy', async ($, on) => {
  await worker($, on)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await altsOf(band)).toEqual([])
  expect((await band.find({ type: 'Text', text: 'engine' }))?.text).toBe('engine')
  await band.unmount()
})

test('in a worker the info command answers one line naming the master and opens no pane', async ($, on) => {
  const run = await worker($, on)
  const line = `This is a worker session of "${MASTER_TITLE}" (${MASTER}): the master session pane is only in that session.`
  expect((await $.command.run(typed('master-session:info', ''))).text).toBe(line)
  expect((await $.command.run(typed('master-session:info', 'ask'))).text).toBe(line)
  expect((await $.command.run(typed('master-session:start', 'status'))).text).toBe(line)
  expect(((await $.tool.call({ tool: 'mcp__master-session__open' })) as { result?: string }).result).toBe(line)
  expect((await $.command.run(typed('master-session:start', 'fix the hooks'))).text).toBe('skill ran')
  expect(run.opened).toEqual([])
})

test('a worker runs no git polling at all, even with a pane open', async ($, on) => {
  const run = await worker($, on, true)
  const before = run.gits.length
  await run.clock.advance(120_000)
  expect(run.gits.length - before).toBe(0)
})

test('a worker does not read the other workers’ reports on its file tick', async ($, on) => {
  const run = await worker($, on)
  await run.clock.advance(60_000)
  expect(run.flights.list.started).toBe(0)
})

test('a worker still records and reports', async ($, on) => {
  await worker($, on)
  const answer = (await $.tool.call({ tool: REPORT_TOOL, state: 'working', progress: 'step 1 of 2 — read' })) as { result?: string }
  expect(answer.result).toMatch(/^ok #\d+$/)
})

test('a validator that is itself a child but owns a board is a master: it polls git and draws its band and pane', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const run = world(on, { parent: MASTER })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await run.clock.advance(15_000)
  expect(run.gits.length).toBeGreaterThan(0)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await altsOf(band)).length).toBeGreaterThan(0)
  await band.unmount()
  expect((await $.command.run(typed('master-session:info', ''))).text).toBe('Master session pane opened.')
  expect(run.opened).toEqual([PANE.requestId])
})

test('a plain session still opens the pane on request but polls no git by itself, pane open or not', async ($, on) => {
  const run = world(on, { isPaneOpen: true })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await run.clock.advance(120_000)
  expect(run.gits.length).toBe(0)
  expect((await $.command.run(typed('master-session:info', ''))).text).toBe('Master session pane opened.')
  expect(run.opened).toEqual([PANE.requestId])
  await run.clock.advance(1_000)
  const after = run.gits.length
  await run.clock.advance(120_000)
  expect(run.gits.length).toBe(after)
})

test('a master polls git while it has a board and not before', async ($, on) => {
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(60_000)
  expect(run.gits.length).toBe(0)
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await run.clock.settle()
  const after = run.gits.length
  expect(after).toBeGreaterThan(0)
  await run.clock.advance(15_000)
  expect(run.gits.length).toBeGreaterThanOrEqual(after)
})

function engineBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

test('a plain session that started side chats shows no band and runs no scans, though a side chat reports to it', async ($, on) => {
  engineBand(on)
  const report = { v: 1, kind: 'status', session: 'local_setup', parent: SELF, seq: 1, at: 3_590_000, run: { isRunning: true }, modelAt: 3_590_000, state: 'working', activity: [], commits: [], tests: [], files: [] }
  const run = world(on, { isPaneOpen: true, files: { [reportPath(HOME, 'local_setup')]: JSON.stringify(report) } })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(120_000)
  expect(run.gits.length).toBe(0)
  await $.command.run(typed('master-session:info', ''))
  await run.clock.settle()
  await $.command.run(typed('seed', ''))
  const scanned = run.gits.length
  await run.clock.advance(120_000)
  expect(run.gits.length).toBe(scanned)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await altsOf(band)).toEqual([])
  expect((await band.find({ type: 'Text', text: 'engine' }))?.text).toBe('engine')
  await band.unmount()
})

test('a side chat of a plain session is a plain session: no band, no scans, no reports written', async ($, on) => {
  engineBand(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  const writes: string[] = []
  on('fs.write', (_, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  const run = world(on, { parent: 'local_plain', isPaneOpen: true })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(120_000)
  const answer = (await $.tool.call({ tool: REPORT_TOOL, state: 'working' })) as { deny?: string }
  expect(String(answer.deny)).toContain('no master session')
  await $.turn.start({ turnId: 't1', text: 'go' })
  await run.clock.advance(10_000)
  expect(writes).toEqual([])
  expect(run.gits.length).toBe(0)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await altsOf(band)).toEqual([])
  await band.unmount()
  expect((await $.command.run(typed('master-session:info', ''))).text).toBe('Master session pane opened.')
})

test('a side chat becomes a worker once its brief loads the worker skill, and report is registered without a call', async ($, on) => {
  on('fs.write', () => ({ value: undefined }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  const run = world(on, { parent: MASTER })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(10_000)
  expect(run.tools).not.toContain('report')
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await run.clock.advance(1_000)
  expect(run.tools).toContain('report')
  expect(((await $.tool.call({ tool: REPORT_TOOL, state: 'working' })) as { result?: string }).result).toMatch(/^ok #\d+$/)
})

test('a child of a plain parent stays plain when its brief or a subagent loads the worker skill', async ($, on) => {
  on('fs.write', () => ({ value: undefined }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  const run = world(on, { parent: 'local_plain' })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await run.clock.advance(10_000)
  expect(run.tools).not.toContain('report')
  expect(String(((await $.tool.call({ tool: REPORT_TOOL, state: 'working' })) as { deny?: string }).deny)).toContain('no master session')
})

test('a real master with a briefed worker still scans, draws its band and shows the worker’s needs-you', async ($, on) => {
  const report = { v: 1, kind: 'status', session: 'local_setup', engineId: 'engine-setup', parent: SELF, seq: 5, at: 3_590_000, run: { isRunning: true }, modelAt: 3_590_000, state: 'needs-you', needsYou: 'Allow Bash: rm -rf build', waits: { since: 3_590_000, on: 'you' }, activity: [], commits: [], tests: [], files: [] }
  const run = await started($, on, BOARD, { files: { [reportPath(HOME, 'local_setup')]: JSON.stringify(report) } })
  await run.clock.advance(15_000)
  expect(run.gits.length).toBeGreaterThan(0)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await altsOf(band)).join()).toContain('needs you')
  await band.unmount()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textsOf(ui)).toContain('Allow Bash: rm -rf build')
  await ui.unmount()
})

test('only an explicit open reaches ui.open: not ticks, a board publish or a start command', async ($, on) => {
  const run = world(on)
  on('skill.prompt', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await run.clock.settle()
  expect((await $.command.run(typed('master-session:info', ''))).text).toBe('Master session pane opened.')
  expect(run.opened).toEqual([PANE.requestId])
  await run.clock.advance(120_000)
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await run.clock.advance(120_000)
  await $.command.run(typed('master-session:start', 'fix the hooks'))
  expect(run.opened).toEqual([PANE.requestId])
})

const START = { skill: 'master-session:start', text: 'Validator.', frontmatter: {}, source: 'plugin' } as const

test('/master-session:start makes the session a master at once: it scans before any board call, and info opens the pane', async ($, on) => {
  engineBand(on)
  on('skill.prompt', (_, e) => ({ text: e.text }))
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.skill.prompt(START)
  await run.clock.advance(15_000)
  expect(run.gits.length).toBeGreaterThan(0)
  expect(run.opened).toEqual([])
  expect((await $.command.run(typed('master-session:info', ''))).text).toBe('Master session pane opened.')
  expect(run.opened).toEqual([PANE.requestId])
})

test('a worker skill preloaded after the start does not turn the validator into a worker', async ($, on) => {
  on('fs.write', () => ({ value: undefined }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  const run = world(on, { parent: 'local_plain' })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.skill.prompt(START)
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await run.clock.advance(1_000)
  expect(String(((await $.tool.call({ tool: REPORT_TOOL, state: 'working' })) as { deny?: string }).deny)).toContain('no master session')
})

const RESTART = { cwd: HOME, surface: 'desktop', isInteractive: true } as const

test('a master that reloads keeps reading its workers: a report written afterwards reaches the pane and the board file is published again', async ($, on) => {
  const writes: string[] = []
  on('fs.write', (_, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  const files: Record<string, string> = {}
  const run = await started($, on, BOARD, { files })
  await $.session.start(RESTART)
  await run.clock.settle()
  writes.length = 0
  const report = { v: 1, kind: 'status', session: 'local_setup', engineId: 'engine-setup', parent: SELF, seq: 5, at: 3_590_000, run: { isRunning: true }, modelAt: 3_590_000, state: 'needs-you', needsYou: 'Allow Bash: rm -rf build', waits: { since: 3_590_000, on: 'you' }, activity: [], commits: [], tests: [], files: [] }
  files[reportPath(HOME, 'local_setup')] = JSON.stringify(report)
  await run.clock.advance(15_000)
  expect(writes).toContain(`${HOME}/.claude/state/master-session/boards/${SELF}.json`)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textsOf(ui)).toContain('Allow Bash: rm -rf build')
  await ui.unmount()
})

test('a briefed worker that reloads still records its next commit with no report call', async ($, on) => {
  const written: Record<string, string> = {}
  on('fs.write', (_, e) => {
    written[e.path] = e.text
    return { value: undefined }
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok', text: '[main 1a2b3c4] feat: x\n 1 file changed' }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  const run = world(on, childOf(3_600_000))
  await $.session.start(RESTART)
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await run.clock.advance(3_000)
  await $.session.start(RESTART)
  await run.clock.advance(3_000)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: x"' })
  const saved = JSON.parse(written[reportPath(HOME, 'local_worker')] ?? '{}') as { commits?: { sha: string }[] }
  expect(saved.commits?.map(one => one.sha)).toEqual(['1a2b3c4'])
})

test('a plan-mode worker that reloads makes no session call', async ($, on) => {
  on('fs.write', () => ({ value: undefined }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('classic.UserPromptSubmit', () => ({}))
  const run = world(on, childOf(3_600_000))
  await $.session.start(RESTART)
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await $.classic.UserPromptSubmit({ prompt: 'go', permission_mode: 'plan' } as never)
  await run.clock.advance(3_000)
  const before = run.calls.length
  await $.session.start(RESTART)
  await run.clock.advance(120_000)
  expect(run.calls.length).toBe(before)
})
