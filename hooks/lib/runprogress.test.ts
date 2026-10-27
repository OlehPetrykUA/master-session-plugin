import { expect, test } from 'claude-code/testing'

import type { AgentRecord, Board, BoardSession, Live, PlanPiece, PlanState } from '../../types'

import { bandProgressWith, bandViewOf, countsText } from './band'
import type { AgentCounts } from './band'
import { boardFromChat, boardFromJson, planOf } from './board'
import { BOARD_SCHEMA } from './constants'
import { CH } from './layout'
import { strip } from '../theme/strip'

const SELF = 'local_master'

const IDLE: AgentCounts = { agents: [], workflows: [], at: 0 }

const columnsFor = (width: number) => Math.ceil((width + 16) / CH)

const piece = (name: string, state: PlanState, progress?: string): PlanPiece => ({ name, state, ...(progress ? { progress } : {}) })

const WORKED: PlanPiece[] = [
  piece('Spec', 'done'),
  piece('Design', 'done'),
  piece('Band build', 'done'),
  piece('Contract parser', 'verifying'),
  piece('Skill text', 'working', 'step 2 of 4 — text'),
  piece('File persistence', 'working'),
  piece('Live check', 'queued'),
  piece('Pane plan list', 'dropped'),
]

const sessionOf = (id: string, state: BoardSession['state'], progress?: string): BoardSession => ({ id, name: id, state, ...(progress ? { progress } : {}) })

const liveOf = (sessions: BoardSession[], archived: string[] = [], running: string[] = sessions.map(one => one.id)): Live => ({
  self: SELF,
  title: '',
  error: '',
  at: 0,
  sessions: sessions.map(one => ({ id: one.id, name: one.name, title: '', cwd: '/', isRunning: running.includes(one.id), isArchived: archived.includes(one.id), lastActivityAt: 0, startedBy: SELF })),
})

const subagent = (id: string): AgentRecord => ({ id, type: 'general-purpose', description: id, state: 'running', startedAt: 1 })

type Options = { sessions?: BoardSession[]; archived?: string[]; running?: string[]; agents?: AgentRecord[]; columns?: number }

const viewOf = (plan: PlanPiece[] | undefined, options: Options = {}) => {
  const sessions = options.sessions ?? []
  const board: Board = { sessions, needsYou: [], repos: [], source: 'tool', ...(plan ? { plan } : {}) }
  const live = liveOf(sessions, options.archived, options.running)
  const counts: AgentCounts = { agents: options.agents ?? [], workflows: [], at: 0 }
  const progress = bandProgressWith(board, live, counts)
  if (!progress) throw new Error('no band')
  return bandViewOf(options.columns ?? 100, board, progress, false, counts, { board: () => undefined, chat: () => undefined }, live)
}

const fillOf = (source: string, tone: string) => Number(source.match(new RegExp(`<path d="M[\\d.]+,0h([\\d.]+)a[^"]*" style="fill:var\\(--${tone}\\)"`))?.[1]) + 10

const stripOf = (view: ReturnType<typeof viewOf>) => strip({ width: view.barWidth, overall: view.overall, tone: view.tone, isSliding: view.isRunning })

const ONE_RUNNING = [sessionOf('local_a', 'working')]

test('AC1 the worked example reads 62% and the fill is 4.4 of 7 of the track', () => {
  const view = viewOf(WORKED, { agents: [subagent('qa')] })
  expect([view.percent, view.isRunning, view.tone]).toEqual([62, true, 'green'])
  expect(Math.abs(view.overall - 4.4 / 7)).toBeLessThan(1e-9)
  expect(Math.abs(fillOf(stripOf(view), 'green') - (4.4 / 7) * view.barWidth)).toBeLessThan(1)
  expect(countsText(view.parts)).toBe('3/7')
})

test('AC2 one done and four queued read 20%, not the percent of the running session', () => {
  const plan = [piece('A', 'done'), ...['B', 'C', 'D', 'E'].map(name => piece(name, 'queued'))]
  expect(viewOf(plan, { sessions: [sessionOf('local_a', 'working', 'step 3 of 4 — x')] }).percent).toBe(20)
})

test('AC3 with a plan the units do not set the percent: one done and one queued read 50%', () => {
  const view = viewOf([piece('A', 'done'), piece('B', 'queued')], { sessions: [sessionOf('local_a', 'working', 'step 3 of 4 — x')], agents: [subagent('s')] })
  expect(view.percent).toBe(50)
})

test('AC4 one piece working at step 2 of 3 reads 66%', () => {
  expect(viewOf([piece('A', 'working', 'step 2 of 3 — x')], { sessions: ONE_RUNNING }).percent).toBe(66)
})

test('AC5 one working piece with no progress reads 0% with at least a 16 px fill and the slider', () => {
  const view = viewOf([piece('A', 'working')], { sessions: ONE_RUNNING })
  expect(view.percent).toBe(0)
  const source = stripOf(view)
  expect(fillOf(source, 'green')).toBeGreaterThanOrEqual(16)
  expect(source).toContain('linearGradient')
})

test('AC6 one verifying piece reads 90%', () => {
  expect(viewOf([piece('A', 'verifying')], { sessions: ONE_RUNNING }).percent).toBe(90)
})

test('AC7 two done and one dropped with a unit idle read 100%, the dropped piece not counted, on a grey fill and 2/2', () => {
  const view = viewOf([piece('A', 'done'), piece('B', 'done'), piece('C', 'dropped')], { sessions: [sessionOf('local_a', 'waiting')], running: [] })
  expect([view.isAllDone, countsText(view.parts), view.percent, view.tone]).toEqual([false, '2/2', 100, 'grey'])
})

test('AC38 a plan with a queued piece and every unit finished reads All N done, N the units, with no percent', () => {
  const view = viewOf([piece('A', 'done'), piece('B', 'queued')], { sessions: [sessionOf('local_a', 'done'), sessionOf('local_b', 'done')], running: [] })
  expect([view.isAllDone, countsText(view.parts), view.alt, view.hasPercent]).toEqual([true, 'All 2 done', 'Master session: all 2 done', false])
})

test('AC36 seven working sessions with no steps and two subagents read 0% and 0/9, with no counts words', () => {
  const sessions = Array.from({ length: 7 }, (_, index) => sessionOf(`local_${index}`, 'working'))
  const view = viewOf(undefined, { sessions, agents: [subagent('a'), subagent('b')] })
  expect([view.percent, countsText(view.parts)]).toEqual([0, '0/9'])
  expect(countsText(view.parts)).not.toMatch(/working|waiting|subagent|workflow/)
})

test('AC8 nine done and one verifying read 99%, never 100%', () => {
  const plan = [...Array.from({ length: 9 }, (_, index) => piece(`D${index}`, 'done')), piece('V', 'verifying')]
  expect(viewOf(plan, { sessions: ONE_RUNNING }).percent).toBe(99)
})

test('AC9 a piece moving to done never lowers the percent', () => {
  for (const state of ['queued', 'working', 'verifying'] as const) {
    const before = viewOf([piece('A', 'done'), piece('B', state, state === 'working' ? 'step 1 of 2 — x' : undefined), piece('C', 'queued')], { sessions: ONE_RUNNING }).percent
    const after = viewOf([piece('A', 'done'), piece('B', 'done'), piece('C', 'queued')], { sessions: ONE_RUNNING }).percent
    expect(after).toBeGreaterThanOrEqual(before)
  }
})

test('AC10 a plan of one done reads 100%, and a queued piece added next reads 50% and 1/2', () => {
  expect(viewOf([piece('A', 'done')]).percent).toBe(100)
  const view = viewOf([piece('A', 'done'), piece('B', 'queued')], { sessions: ONE_RUNNING })
  expect([view.percent, countsText(view.parts), view.alt]).toEqual([50, '1/2', 'Master session: 50 percent, 1 of 2 done'])
})

test('AC11 a FAIL sends a verifying piece back to working: the count stays 2 and the percent goes from 45 to 25', () => {
  const before = viewOf([piece('A', 'verifying'), piece('B', 'queued')], { sessions: ONE_RUNNING })
  const after = viewOf([piece('A', 'working', 'step 1 of 2 — x'), piece('B', 'queued')], { sessions: ONE_RUNNING })
  expect([before.percent, after.percent, countsText(before.parts).split('/')[1], countsText(after.parts).split('/')[1]]).toEqual([45, 25, '2', '2'])
})

test('AC12 every piece done while a subagent runs reads 100% on a green full fill with the slider and no all-done check', () => {
  const view = viewOf([piece('A', 'done'), piece('B', 'done')], { agents: [subagent('s')] })
  expect([view.percent, view.tone, view.isAllDone, view.isRunning, view.hasPercent]).toEqual([100, 'green', false, true, true])
  const source = stripOf(view)
  expect(fillOf(source, 'green')).toBe(view.barWidth)
  expect(source).toContain('linearGradient')
})

test('AC13 archiving done sessions changes nothing when a plan is present', () => {
  const sessions = [sessionOf('local_a', 'done'), sessionOf('local_b', 'done'), sessionOf('local_c', 'done'), sessionOf('local_d', 'working', 'step 1 of 2 — x')]
  const plan = [piece('A', 'done'), piece('B', 'done'), piece('C', 'done'), piece('D', 'working', 'step 1 of 2 — x'), piece('E', 'queued')]
  const open = viewOf(plan, { sessions })
  const archived = viewOf(plan, { sessions, archived: ['local_a', 'local_b', 'local_c'] })
  expect([archived.percent, archived.parts, archived.overall]).toEqual([open.percent, open.parts, open.overall])
})

test('AC14 the count after the percent is done/total: the AC1 plan reads 3/7 in the count text style', () => {
  const view = viewOf(WORKED, { agents: [subagent('qa')] })
  expect(view.parts).toEqual([{ text: '3', isNumber: true }, { text: '/', isNumber: false }, { text: '7', isNumber: true }])
  expect(view.showCounts).toBe(true)
})

test('AC15 the accessible text holds the percent and the piece count', () => {
  expect(viewOf(WORKED, { agents: [subagent('qa')] }).alt).toBe('Master session: 62 percent, 3 of 7 done')
})

test('AC16 a unit asking the user shows the pill and Open chat, with no percent and no count', () => {
  const view = viewOf(WORKED, { sessions: [{ ...sessionOf('local_a', 'needs-you'), needsYou: 'which one?' }] })
  expect([view.tone, view.hasPercent, view.parts, view.action?.name]).toEqual(['red', false, [], 'chat'])
})

test('AC17 a plan not all done with nothing running reads on a grey fill, with no slider', () => {
  const view = viewOf([piece('A', 'done'), piece('B', 'queued')], { sessions: ONE_RUNNING, running: [] })
  expect([view.tone, view.isRunning, view.percent, countsText(view.parts)]).toEqual(['grey', false, 50, '1/2'])
  expect(stripOf(view)).not.toContain('linearGradient')
})

const TODAY = [sessionOf('local_a', 'waiting', 'step 4 of 5 — x'), sessionOf('local_b', 'working', 'step 3 of 5 — x'), sessionOf('local_c', 'working', 'step 4 of 5 — x'), sessionOf('local_d', 'done', 'step 5 of 5 — x')]

test('without a plan the band computes as today: 80% and 1/4', () => {
  const view = viewOf(undefined, { sessions: TODAY })
  expect([view.percent, countsText(view.parts), view.alt]).toEqual([80, '1/4', 'Master session: 80 percent, 1 of 4 done'])
})

test('AC19 an empty plan and a plan of only dropped pieces compute as today', () => {
  const today = viewOf(undefined, { sessions: TODAY })
  for (const plan of [[], [piece('A', 'dropped'), piece('B', 'dropped')]]) {
    const view = viewOf(plan, { sessions: TODAY })
    expect([view.percent, view.overall, view.parts, view.alt, view.isAllDone]).toEqual([today.percent, today.overall, today.parts, today.alt, today.isAllDone])
  }
})

test('AC21 a board read from chat carries no plan, so the band computes as today', () => {
  const board = boardFromChat('🕐 **Tick 10:00** · 🟢 1 working\n\n| | 🤖 Session | ▸ Now | → Next |\n|---|---|---|---|\n| 🟢 | [one](#local_one) | x | y |')
  expect(board?.sessions.length).toBe(1)
  expect(board?.plan).toBeUndefined()
})

test('AC27 the board tool schema has plan with name and state required, state limited to the five, progress as step N of M', () => {
  const plan = BOARD_SCHEMA.properties.plan
  expect([plan.type, plan.items.required, plan.items.properties.state.enum]).toEqual(['array', ['name', 'state'], ['queued', 'working', 'verifying', 'done', 'dropped']])
  expect(plan.items.properties.progress.description).toBe('step N of M — label, for a working piece')
})

test('AC28 a malformed plan is refused with a message naming plan: no name, state started, progress step 5 of 4, a string', () => {
  for (const plan of [[{ state: 'done' }], [{ name: 'A', state: 'started' }], [{ name: 'A', state: 'working', progress: 'step 5 of 4' }], [{ name: 'A', state: 'working', progress: 'step 1 of 0' }], 'big', [7]]) {
    expect(planOf(plan).error).toContain('plan')
    expect(planOf(plan).plan).toBeUndefined()
  }
})

test('AC29 a plan of 51 pieces is refused naming the cap of 50, and 50 pass', () => {
  const pieces = (count: number) => Array.from({ length: count }, (_, index) => ({ name: `P${index}`, state: 'queued' }))
  expect(planOf(pieces(51)).error).toContain('cap is 50')
  expect(planOf(pieces(50)).plan?.length).toBe(50)
})

test('AC30 a 120 character name is stored as its first 80 characters and an ellipsis', () => {
  const name = 'n'.repeat(120)
  expect(planOf([{ name, state: 'queued' }]).plan?.[0]?.name).toBe(`${'n'.repeat(80)}…`)
})

test('AC33 a piece working at step 4 of 4 reads 85%, then verifying 90%', () => {
  const working = viewOf([piece('A', 'working', 'step 4 of 4 — x')], { sessions: ONE_RUNNING }).percent
  const verifying = viewOf([piece('A', 'verifying')], { sessions: ONE_RUNNING }).percent
  expect([working, verifying]).toEqual([85, 90])
})

test('AC34 two pieces named Skill text are refused naming Skill text', () => {
  const answer = planOf([{ name: 'Skill text', state: 'done' }, { name: 'Skill text', state: 'queued' }])
  expect(answer.error).toContain('"Skill text"')
  expect(answer.plan).toBeUndefined()
})

test('AC35 the AC1 plan reads 62% then 3/7 at 760 px, 62% then 3/7 at 390 px, and the bar only at 300 px', () => {
  const at = (px: number) => viewOf(WORKED, { agents: [subagent('qa')], columns: columnsFor(px) })
  const wide = at(760)
  expect([wide.hasPercent, wide.percent, wide.showCounts, countsText(wide.parts)]).toEqual([true, 62, true, '3/7'])
  const mid = at(390)
  expect([mid.hasPercent, mid.percent, mid.showCounts, countsText(mid.parts)]).toEqual([true, 62, true, '3/7'])
  const small = at(300)
  expect([small.hasPercent, small.showCounts]).toEqual([false, false])
  expect(small.barWidth).toBeGreaterThanOrEqual(48)
})

test('the count without a plan is finished units over all units, with a plan done pieces over counted pieces', () => {
  expect(countsText(viewOf(undefined, { sessions: TODAY, agents: [subagent('s')] }).parts)).toBe('1/5')
  expect(countsText(viewOf([piece('A', 'done'), piece('B', 'queued'), piece('C', 'dropped')], { sessions: TODAY }).parts)).toBe('1/2')
})

test('no zero counts and no words are ever drawn in the count: working, waiting, subagent and workflow are gone', () => {
  const views = [viewOf(undefined, { sessions: [] , agents: [subagent('s')] }), viewOf(undefined, { sessions: TODAY }), viewOf(WORKED), viewOf([piece('A', 'queued')])]
  for (const view of views) expect(countsText(view.parts)).toMatch(/^\d+\/\d+$/)
  for (const view of views) expect(countsText(view.parts)).not.toMatch(/working|waiting|subagent|workflow|·/)
})

test('a name is cut to 80 before the duplicate check, and progress on a piece that is not working is ignored even when malformed', () => {
  const long = 'x'.repeat(90)
  expect(planOf([{ name: long, state: 'queued' }, { name: `${long}y`, state: 'queued' }]).error).toContain('twice')
  expect(planOf([{ name: 'A', state: 'done', progress: 'nonsense' }]).plan).toEqual([piece('A', 'done')])
})

test('planOf keeps a valid plan, drops progress of a piece that is not working, and treats a missing plan as none', () => {
  expect(planOf(undefined)).toEqual({})
  expect(planOf([{ name: ' A ', state: 'done', progress: 'step 1 of 2 — x' }, { name: 'B', state: 'working', progress: 'step 1 of 2 — x' }]).plan).toEqual([piece('A', 'done'), piece('B', 'working', 'step 1 of 2 — x')])
  expect(boardFromJson({ sessions: [], plan: [] }, 'tool')?.plan).toBeUndefined()
  expect(boardFromJson({ sessions: [], plan: [{ name: 'A', state: 'queued' }] }, 'tool')?.plan).toEqual([piece('A', 'queued')])
})
