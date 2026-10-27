import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { PlanPiece } from '../../types'

import { BOARD_SCHEMA } from '../lib/constants'
import { BAND, BOARD_TOOL, HOME, SELF, altsOf, started, textsOf, typed, warmUp } from '../testing/world'
import { boardPath, readBoard, writeBoard } from './status'

warmUp()

const BOARD_FILE = `${HOME}/.claude/state/master-session/boards/${SELF}.json`

const STOP = 'master-session:stop'

const SESSIONS = [{ id: 'local_setup', name: 'setup-ui-redo', state: 'working', progress: 'step 2 of 5 — x' }]

const PLAN: PlanPiece[] = [
  { name: 'Spec', state: 'done' },
  { name: 'Build', state: 'working', progress: 'step 1 of 2 — x' },
  { name: 'Check', state: 'queued' },
  { name: 'Old', state: 'dropped' },
]

const board = (extra: Record<string, unknown> = {}) => ({ tick: '09:00', sessions: SESSIONS, needsYou: [], repos: [], ...extra })

const MIN = 60_000

async function master($: Engine, on: On, extra: Record<string, unknown> = { plan: PLAN }) {
  const writes: string[] = []
  on('fs.write', (_, e) => {
    if (e.path === BOARD_FILE) writes.push(e.text)
    return { value: undefined }
  })
  on('agent.list', () => ({ value: [] }))
  const run = await started($, on, board(extra))
  return { ...run, writes }
}

const call = ($: Engine, extra: Record<string, unknown>) => $.tool.call({ tool: BOARD_TOOL, ...board(extra) }) as Promise<{ result?: string; deny?: string }>

const bandTexts = async ($: Engine) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const texts = await textsOf(ui)
  await ui.unmount()
  return texts.map(one => one.replace(/[  ]/g, '').trim()).filter(one => /^(\d+%|\d+\/\d+|\d+)$/.test(one))
}

const lastPlan = (writes: string[]) => (JSON.parse(writes.at(-1) ?? '{}') as { board?: { plan?: PlanPiece[] } }).board?.plan

const bare = (plan: PlanPiece[] | undefined) => plan?.map(({ since, ...rest }) => rest)

test('T1 a board call with a plan, then one without: the stored plan and the band stay', async ($, on) => {
  const run = await master($, on)
  const planned = await bandTexts($)
  expect(planned).toEqual(['50%', '1/3', '1', '3'])
  const answer = await call($, {})
  await run.clock.settle()
  expect(answer.deny).toBeUndefined()
  expect(await bandTexts($)).toEqual(planned)
  expect(bare(lastPlan(run.writes))).toEqual(PLAN)
})

test('T1 and T2 a call that lists two pieces keeps the rest, and the reply names the kept pieces and the plan growing', async ($, on) => {
  const run = await master($, on)
  const answer = await call($, { plan: [{ name: 'Build', state: 'verifying' }, { name: 'Ship', state: 'queued' }] })
  await run.clock.settle()
  expect(answer.result).toContain('Kept: Spec, Check, Old.')
  expect(answer.result).toContain('Plan grew 3 → 4.')
  expect(bare(lastPlan(run.writes))?.map(one => `${one.name}:${one.state}`)).toEqual(['Spec:done', 'Build:verifying', 'Check:queued', 'Old:dropped', 'Ship:queued'])
  expect(await bandTexts($)).toEqual(['43%', '1/4', '1', '4'])
})

test('T6 moving a verifying piece back to working is accepted and the reply warns', async ($, on) => {
  const run = await master($, on, { plan: [{ name: 'A', state: 'verifying' }, { name: 'B', state: 'queued' }] })
  const answer = await call($, { plan: [{ name: 'A', state: 'working', progress: 'step 1 of 2 — x' }] })
  await run.clock.settle()
  expect(answer.deny).toBeUndefined()
  expect(answer.result).toContain('Moved back to working: A.')
})

test('T9 a merged plan past 100 pieces not dropped is refused naming the cap of 100, and saves nothing', async ($, on) => {
  const full = Array.from({ length: 50 }, (_, index) => ({ name: `P${index}`, state: 'queued' }))
  const run = await master($, on, { plan: full })
  expect((await call($, { plan: Array.from({ length: 50 }, (_, index) => ({ name: `Q${index}`, state: 'queued' })) })).deny).toBeUndefined()
  const writes = run.writes.length
  const answer = await call($, { plan: [{ name: 'one more', state: 'queued' }] })
  await run.clock.settle()
  expect(String(answer.deny)).toContain('cap is 100')
  expect(run.writes.length).toBe(writes)
})

test('the run window restarts when the first plan arrives on a board that had none', async ($, on) => {
  const run = await master($, on, {})
  await run.clock.advance(5 * MIN)
  await call($, { plan: PLAN })
  await run.clock.settle()
  const first = JSON.parse(run.writes.at(-1) ?? '{}') as { board?: { since?: number } }
  await run.clock.advance(5 * MIN)
  await call($, { plan: [{ name: 'More', state: 'queued' }] })
  await run.clock.settle()
  const next = JSON.parse(run.writes.at(-1) ?? '{}') as { board?: { since?: number } }
  expect(first.board?.since).toBeGreaterThanOrEqual(5 * MIN)
  expect(next.board?.since).toBe(first.board?.since)
})

test('a run name starts a new window: a new run resets the plan and the elapsed, the same run keeps both', async ($, on) => {
  const run = await master($, on, { plan: PLAN, run: 'one' })
  await run.clock.advance(5 * MIN)
  await call($, { plan: [{ name: 'Extra', state: 'queued' }], run: 'one' })
  await run.clock.settle()
  const kept = JSON.parse(run.writes.at(-1) ?? '{}') as { board?: { plan?: PlanPiece[]; since?: number; run?: string } }
  expect([kept.board?.plan?.length, kept.board?.run]).toEqual([5, 'one'])
  const first = kept.board?.since
  await run.clock.advance(5 * MIN)
  await call($, { plan: [{ name: 'Fresh', state: 'queued' }], run: 'two' })
  await run.clock.settle()
  const next = JSON.parse(run.writes.at(-1) ?? '{}') as { board?: { plan?: PlanPiece[]; since?: number; run?: string } }
  expect(bare(next.board?.plan)).toEqual([{ name: 'Fresh', state: 'queued' }])
  expect(next.board?.since).toBeGreaterThan(first ?? Infinity)
})

test('a call that omits run after one that carried it stays in the same run: the plan and the window are kept', async ($, on) => {
  const run = await master($, on, { plan: PLAN, run: 'one' })
  const first = (JSON.parse(run.writes.at(-1) ?? '{}') as { board?: { since?: number } }).board?.since
  await run.clock.advance(5 * MIN)
  await call($, { plan: [{ name: 'Extra', state: 'queued' }] })
  await run.clock.settle()
  const next = JSON.parse(run.writes.at(-1) ?? '{}') as { board?: { plan?: PlanPiece[]; since?: number; run?: string } }
  expect([next.board?.plan?.length, next.board?.run, next.board?.since]).toEqual([5, 'one', first])
})

test('AC22 a hot reload with no new board call shows the same percent and piece count', async ($, on) => {
  const run = await master($, on)
  const before = await bandTexts($)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  expect(await bandTexts($)).toEqual(before)
  expect(before).toContain('1/3')
})

test('AC23 the board file holds the plan, with the progress of a working piece, and reading it back returns the same plan', async ($, on) => {
  const { writes } = await master($, on)
  expect(bare(lastPlan(writes))).toEqual(PLAN)
  expect(lastPlan(writes)?.every(one => typeof one.since === 'number')).toBe(true)
  const files: Record<string, string> = {}
  const io = { fs: { write: async (path: string, text: string) => void (files[path] = text), read: async (path: string) => files[path] ?? '', stat: async (path: string) => ({ kind: 'file' as const, size: (files[path] ?? '').length, mtimeMs: 1, isLink: false }) } } as unknown as Parameters<typeof readBoard>[0]
  await writeBoard(io, HOME, { at: 10 * MIN, masterId: SELF, board: { sessions: [], needsYou: [], repos: [], source: 'tool', plan: PLAN } })
  expect((await readBoard(io, HOME, SELF, 11 * MIN))?.board.plan).toEqual(PLAN)
})

test('AC24 two board calls that differ only in the plan, a minute apart: the file holds the second plan', async ($, on) => {
  const { writes, clock } = await master($, on)
  await clock.advance(MIN)
  await call($, { plan: [{ name: 'Ship', state: 'queued' }] })
  await clock.settle()
  expect(bare(lastPlan(writes))).toEqual([...PLAN, { name: 'Ship', state: 'queued' }])
})

test('AC25 a board file with a plan older than 30 minutes with no board call since reads as no board', async () => {
  const files: Record<string, string> = {}
  const io = { fs: { write: async (path: string, text: string) => void (files[path] = text), read: async (path: string) => files[path] ?? '', stat: async (path: string) => ({ kind: 'file' as const, size: (files[path] ?? '').length, mtimeMs: 2, isLink: false }) } } as unknown as Parameters<typeof readBoard>[0]
  await writeBoard(io, '/home/stale', { at: 10 * MIN, masterId: SELF, board: { sessions: [], needsYou: [], repos: [], source: 'tool', plan: PLAN } })
  expect(files[boardPath('/home/stale', SELF)]).toContain('"plan"')
  expect(await readBoard(io, '/home/stale', SELF, 41 * MIN + 1)).toBeUndefined()
  expect((await readBoard(io, '/home/stale', SELF, 40 * MIN))?.board.plan).toEqual(PLAN)
})

test('AC26 /master-session:stop takes the plan with the board: the band draws nothing from it', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const run = await master($, on, { plan: PLAN, sessions: [{ id: 'local_setup', name: 'setup-ui-redo', state: 'waiting' }] })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await altsOf(band)).some(one => String(one).startsWith('Master session: 50 percent, 1 of 3 done.'))).toBe(true)
  await $.command.run(typed(STOP, 'force'))
  await run.clock.settle()
  expect(await altsOf(band)).toEqual([])
  await band.unmount()
})

test('AC28 a malformed plan is refused with a message naming plan, and the band and the board file stay unchanged', async ($, on) => {
  const run = await master($, on)
  const before = await bandTexts($)
  const writes = run.writes.length
  for (const plan of [[{ state: 'done' }], [{ name: 'A', state: 'started' }], [{ name: 'A', state: 'working', progress: 'step 5 of 4' }], 'plan']) {
    const answer = await call($, { plan })
    expect(answer.deny).toContain('plan')
    expect(answer.result).toBeUndefined()
  }
  await run.clock.settle()
  expect(await bandTexts($)).toEqual(before)
  expect(run.writes.length).toBe(writes)
})

test('AC29 a board call with 51 plan entries is refused naming the cap of 50 and saves nothing', async ($, on) => {
  const run = await master($, on)
  const writes = run.writes.length
  const answer = await call($, { plan: Array.from({ length: 51 }, (_, index) => ({ name: `P${index}`, state: 'queued' })) })
  expect(String(answer.deny)).toContain('50')
  await run.clock.settle()
  expect(run.writes.length).toBe(writes)
})

test('AC30 a plan entry with a 120 character name is accepted and stored as its first 80 characters and an ellipsis', async ($, on) => {
  const run = await master($, on)
  const answer = await call($, { plan: [{ name: 'x'.repeat(120), state: 'queued' }] })
  await run.clock.settle()
  expect(answer.deny).toBeUndefined()
  expect(lastPlan(run.writes)?.at(-1)?.name).toBe(`${'x'.repeat(80)}…`)
})

test('AC34 two entries named Skill text are refused naming Skill text, and the band and the board file stay unchanged', async ($, on) => {
  const run = await master($, on)
  const before = await bandTexts($)
  const writes = run.writes.length
  const answer = await call($, { plan: [{ name: 'Skill text', state: 'done' }, { name: 'Skill text', state: 'queued' }] })
  expect(String(answer.deny)).toContain('"Skill text"')
  await run.clock.settle()
  expect(await bandTexts($)).toEqual(before)
  expect(run.writes.length).toBe(writes)
})

test('the board tool is registered with the plan schema', () => {
  expect(Object.keys(BOARD_SCHEMA.properties)).toContain('plan')
})
