import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BAND, BOARD, BOARD_TOOL, HOME, PANE, SELF, SPAWN, altsOf, click, hitsOf, started, textsOf, typed, warmUp, world } from '../testing/world'
import type { Child, Ui } from '../testing/world'

warmUp()

const WIDE = { ...PANE, surface: 'desktop' as const, props: { ...PANE.props, bodyColumns: 100 } }

function crew($: Engine, on: On) {
  let running: string[] = []
  on('agent.list', () => ({ value: running.map(id => ({ id, description: id, type: 'general-purpose', status: 'running' as const })) }))
  on('agent.spawn', (_, event) => {
    running = [...running, event.description]
    return { model: 'claude-haiku-5-5', agentId: event.description }
  })
  on('turn.complete', (_, event) => {
    running = running.filter(id => id !== event.agentId)
    return { text: event.answer }
  })
  return {
    spawn: (description: string, subagentType = 'general-purpose') => $.agent.spawn({ ...SPAWN, name: undefined, description, subagentType }),
    end: (agentId: string) => $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: `turn-${agentId}`, agentId, reason: 'answer' }),
  }
}

const textOf = async (ui: Ui, key: string) => String((await ui.find({ key }))?.text ?? '')

const altOf = async (ui: Ui, key: string) => (JSON.stringify(await ui.find({ key })).match(/"alt":"([^"]*)"/g) ?? []).at(-1)?.slice(7, -1) ?? ''

const countOf = async (ui: Ui, key: string) => Number(/(\d+)$/.exec((await textOf(ui, key)) || (await altOf(ui, key)))?.[1])

const MINUTE = 60_000

const LONG = { timeoutMs: 30_000 }

test('finished subagents stay in Done for ten minutes and more, and the Done chip, the Agents tile and the band all count them', LONG, async ($, on) => {
  const c = crew($, on)
  const run = await started($, on, { ...BOARD, sessions: [BOARD.sessions[1]], needsYou: [] })
  await c.spawn('Review auth flow')
  await c.spawn('Find usages')
  await c.end('Review auth flow')
  await run.clock.advance(11 * MINUTE)
  const ui = await $.ui.mount(WIDE)
  expect(await hitsOf(ui)).toContain('hit-row-Review auth flow')
  expect(await countOf(ui, 'chip-done')).toBe(1)
  expect(await altOf(ui, 'block-agents')).toBe('Agents 2')
  expect(await textOf(ui, 'block-agents')).toContain('1 working · 1 done')
  expect(await altOf(ui, 'block-needs-you')).toBe(`Needs you ${await countOf(ui, 'chip-needs-you')}`)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const alt = String((await band.findAll({ type: 'Svg' })).find(one => String(one.props.source).includes('width="4096"'))?.props.alt)
  expect(alt).toContain(`${await countOf(ui, 'chip-done')} of ${await countOf(ui, 'chip-all')} done`)
  await band.unmount()
  await ui.unmount()
})

test('Clear done hides finished subagents, never archives one, and brings no Archived chip', LONG, async ($, on) => {
  const c = crew($, on)
  const run = await started($, on, { ...BOARD, sessions: [] }, { isBare: true })
  await c.spawn('Review auth flow')
  await c.spawn('Qa check', 'master-session:qa-verifier')
  await c.end('Review auth flow')
  await c.end('Qa check')
  await run.clock.advance(MINUTE)
  const ui = await $.ui.mount(WIDE)
  expect(await countOf(ui, 'chip-done')).toBe(2)
  expect(await textOf(ui, 'block-agents')).toContain('2 done')
  expect(await textOf(ui, 'block-agents')).not.toContain('working')
  await click(ui, 'hit-clear-done')
  await run.clock.settle()
  expect(run.calls.filter(one => one.tool === 'archive_session')).toEqual([])
  expect(await countOf(ui, 'chip-all')).toBe(0)
  expect(await altOf(ui, 'block-agents')).toBe('Agents 0')
  expect(await hitsOf(ui)).not.toContain('hit-chip-archived')
  await ui.unmount()
})

test('quiet seconds redraw nothing: the tiles and rows change only with a count or a minute', LONG, async ($, on) => {
  let renders = 0
  on('ui.invalidate', (_, event, next) => {
    if (event.event === 'ui.render') renders += 1
    return next(event)
  })
  const run = await started($, on, BOARD)
  const ui = await $.ui.mount(WIDE)
  await run.clock.advance(2 * MINUTE + 5_000)
  const before = renders
  await run.clock.advance(10_000)
  expect(renders).toBe(before)
  await run.clock.advance(MINUTE)
  expect(renders).toBeGreaterThan(before)
  await ui.unmount()
})

test('a new run name or the first plan resets the run window; the same name keeps it; a stop clears the board', LONG, async ($, on) => {
  on('skill.prompt', (_, event) => ({ text: event.text }))
  const run = await started($, on, { ...BOARD, run: 'x' })
  const durationOf = async () => {
    const ui = await $.ui.mount(WIDE)
    const alt = await altOf(ui, 'block-duration')
    await ui.unmount()
    return alt
  }
  await run.clock.advance(2 * MINUTE)
  expect(await durationOf()).toBe('Duration 2m')
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD, run: 'x' })
  expect(await durationOf()).toBe('Duration 2m')
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD, run: 'x', plan: [{ name: 'a', state: 'queued' }] })
  expect(await durationOf()).toBe('Duration <1m')
  await run.clock.advance(2 * MINUTE)
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD, run: 'x', plan: [{ name: 'a', state: 'working' }] })
  expect(await durationOf()).toBe('Duration 2m')
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD, run: 'y', plan: [{ name: 'b', state: 'queued' }] })
  expect(await durationOf()).toBe('Duration <1m')
  const stopped = await $.command.run(typed('master-session:stop', 'force'))
  expect(stopped.text).toMatch(/^Stopped/)
  await run.clock.advance(3 * MINUTE)
  const bare = await $.ui.mount(WIDE)
  expect(await bare.find({ key: 'block-duration' })).toBeUndefined()
  await bare.unmount()
  await $.skill.prompt({ skill: 'master-session:start', text: 'Validator.', frontmatter: {}, source: 'plugin' })
  await run.clock.settle()
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD, run: 'y', plan: [{ name: 'b', state: 'queued' }] })
  expect(await durationOf()).toBe('Duration <1m')
})

test('AC12: the terminal tiles are rows of 4, 3 and 2 at 100, 76 and 36 columns, each Label value over its sub', LONG, async ($, on) => {
  const plan = [{ name: 'a', state: 'done' }, { name: 'b', state: 'working' }, { name: 'c', state: 'queued' }]
  await started($, on, { ...BOARD, plan })
  const mount = (columns: number) => $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: columns } })
  type Node = { props?: Record<string, unknown>; children?: (Node | string)[] }
  const tilesOf = async (columns: number) => {
    const ui = await mount(columns)
    const rows = (await ui.findAll({ type: 'Box' })).filter(one => /^tiles-\d+$/.test(one.key ?? '')).length
    const tile = async (key: string) => JSON.parse(JSON.stringify(await ui.find({ key: `tile-${key}` }))) as Node & { text: string }
    const found = { rows, needs: await tile('needs-you'), commits: await tile('commits'), plan: await tile('plan') }
    await ui.unmount()
    return found
  }
  const lineOf = (tile: Node, index: number) => (tile.children?.[index] as Node).children as Node[]
  const wide = await tilesOf(100)
  const mid = await tilesOf(76)
  const narrow = await tilesOf(36)
  expect([wide.rows, mid.rows, narrow.rows]).toEqual([2, 3, 4])
  expect(wide.plan.text).toContain('· 2 sessions')
  expect(narrow.plan.text).not.toContain('sessions')
  const [label, value] = lineOf(wide.needs, 0)
  expect([label?.children, value?.children]).toEqual([['Needs you'], ['1']])
  expect([label?.props?.color, value?.props?.color, value?.props?.weight]).toEqual(['error', 'error', 'semibold'])
  const [calmLabel, calmValue] = lineOf(wide.commits, 0)
  expect([calmLabel?.props?.dimColor, calmValue?.props?.weight, calmValue?.props?.color]).toEqual([true, 'semibold', undefined])
  expect(lineOf(wide.commits, 1).every(one => one.props?.dimColor === true && one.props?.wrap === 'truncate-end')).toBe(true)
  expect(wide.needs.children).toHaveLength(2)
})

test('AC12: an all-done run reads its first variant that fits the 17 column tile at 36 columns', LONG, async ($, on) => {
  await started($, on, { ...BOARD, sessions: [{ id: 'local_env', name: 'env', state: 'done' }], needsYou: [], plan: [{ name: 'a', state: 'done' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 36 } })
  expect(String((await ui.find({ key: 'tile-duration' }))?.text)).toMatch(/^Duration\S+\d\d:\d\d – \d\d:\d\d$/)
  await ui.unmount()
})

test('AC12: a Tests tile of 412 shows its full sub "from 3 QA passes" at 36 columns, where it fits only at the full tile width', LONG, async ($, on) => {
  const sessions = [100, 200, 112].map((count, index) => ({ id: `local_q${index}`, name: `q${index}`, state: 'done', tests: [`vitest · ${count} passed`] }))
  await started($, on, { ...BOARD, sessions, needsYou: [], plan: [{ name: 'a', state: 'done' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 36 } })
  expect(String((await ui.find({ key: 'tile-tests' }))?.text)).toBe('Tests412from 3 QA passes')
  await ui.unmount()
})

test('AC13: when the master itself asks, the band shows the question and the Needs you chip and tile stay 0', LONG, async ($, on) => {
  await started($, on, { ...BOARD, sessions: [{ id: SELF, name: 'master', state: 'needs-you', needsYou: 'Approve the push' }], needsYou: [] })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const alt = String((await band.findAll({ type: 'Svg' })).find(one => String(one.props.source).includes('width="4096"'))?.props.alt)
  expect(alt).toContain('Approve the push')
  await band.unmount()
  const ui = await $.ui.mount(WIDE)
  expect([await countOf(ui, 'chip-needs-you'), await altOf(ui, 'block-needs-you')]).toEqual([0, 'Needs you 0'])
  await ui.unmount()
})

test('cold start: the merged board file wins over the last board call, so the plan and the run start survive a reload', LONG, async ($, on) => {
  const plan = [{ name: 'a', state: 'done' }, { name: 'b', state: 'queued' }, { name: 'c', state: 'working' }]
  const file = JSON.stringify({ v: 1, kind: 'board', at: 3_500_000, masterId: SELF, board: { ...BOARD, plan, since: 3_000_000 } })
  const child: Child = {
    files: { [`${HOME}/.claude/state/master-session/boards/${SELF}.json`]: file },
    messages: [{ role: 'assistant', text: '', toolUses: [{ tool: BOARD_TOOL, isError: false, input: { ...BOARD, plan: [{ name: 'c', state: 'working' }] } }] }],
  }
  const run = world(on, child)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.command.run(typed('master-session:info', ''))
  await run.clock.settle()
  const ui = await $.ui.mount(WIDE)
  expect(await altsOf(ui)).toContain('Plan 1/3')
  expect(await altOf(ui, 'block-duration')).toBe('Duration 10m')
  expect((await textsOf(ui)).length).toBeGreaterThan(0)
  await ui.unmount()
})

test('cold start keeps the since of a working piece, so the band time fill does not restart', LONG, async ($, on) => {
  const since = 3_600_000 - 6 * MINUTE
  const plan = [{ name: 'c', state: 'working', tier: 'T1', since }]
  const file = JSON.stringify({ v: 1, kind: 'board', at: 3_500_000, masterId: SELF, board: { ...BOARD, sessions: [], needsYou: [], plan, since: 3_000_000 } })
  const child: Child = { files: { [`${HOME}/.claude/state/master-session/boards/${SELF}.json`]: file } }
  const run = world(on, child)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.command.run(typed('master-session:info', ''))
  await run.clock.settle()
  const bandAlt = async () => {
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const alt = String((await band.findAll({ type: 'Svg' })).find(one => String(one.props.source).includes('width="4096"'))?.props.alt)
    await band.unmount()
    return alt
  }
  const first = await bandAlt()
  expect(first).toContain('20 percent')
  await run.clock.advance(1_000)
  expect(await bandAlt()).toBe(first)
})
