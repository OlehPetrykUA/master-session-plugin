import { expect, test } from 'claude-code/testing'

import type { AgentRecord, Board, BoardSession, Live, PlanPiece, PlanState } from '../../types'

import { bandProgressWith, bandViewOf, countsText } from './band'
import type { AgentCounts } from './band'
import { boardFromChat, boardFromJson, mergePlan, planNoteOf, planOf } from './board'
import { BOARD_SCHEMA, PLAN_LIMIT } from './constants'
import { CH } from './layout'
import { strip } from '../theme/strip'

const SELF = 'local_master'

const IDLE: AgentCounts = { agents: [], workflows: [], at: 0 }

const columnsFor = (width: number) => Math.ceil((width + 16) / CH)

const MIN = 60_000

const AT = 100 * MIN

const piece = (name: string, state: PlanState, progress?: string, extra: Pick<PlanPiece, 'tier' | 'since'> = {}): PlanPiece => ({ name, state, ...(progress ? { progress } : {}), ...extra })

const WORKED: PlanPiece[] = [
  piece('Spec', 'done', undefined, { tier: 'doc' }),
  piece('Design', 'done', undefined, { tier: 'doc' }),
  piece('Band build', 'done', undefined, { tier: 'T3' }),
  piece('Contract parser', 'verifying', undefined, { tier: 'T1' }),
  piece('Skill text', 'working', 'step 2 of 4 — text', { tier: 'T0' }),
  piece('File persistence', 'working', undefined, { tier: 'T1', since: AT - 12 * MIN }),
  piece('Live check', 'queued', undefined, { tier: 'T2' }),
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

type Options = { sessions?: BoardSession[]; archived?: string[]; running?: string[]; agents?: AgentRecord[]; columns?: number; at?: number }

const viewOf = (plan: PlanPiece[] | undefined, options: Options = {}) => {
  const sessions = options.sessions ?? []
  const board: Board = { sessions, needsYou: [], repos: [], source: 'tool', ...(plan ? { plan } : {}) }
  const live = liveOf(sessions, options.archived, options.running)
  const counts: AgentCounts = { agents: options.agents ?? [], workflows: [], at: options.at ?? AT }
  const progress = bandProgressWith(board, live, counts)
  if (!progress) throw new Error('no band')
  return bandViewOf(options.columns ?? 100, board, progress, false, counts, { board: () => undefined, chat: () => undefined }, live)
}

const fillOf = (source: string, tone: string) => Number(source.match(new RegExp(`<path d="M[\\d.]+,0h([\\d.]+)a[^"]*" style="fill:var\\(--${tone}\\)"`))?.[1]) + 6

const stripOf = (view: ReturnType<typeof viewOf>) => strip({ width: view.barWidth, overall: view.overall, tone: view.tone, isSliding: view.isRunning })

const ONE_RUNNING = [sessionOf('local_a', 'working')]

test('AC39 the tiered worked example reads 62% 3/7 and the fill is 149.5 of 240 of the track', () => {
  const view = viewOf(WORKED, { agents: [subagent('qa')] })
  expect([view.percent, view.isRunning, view.tone]).toEqual([62, true, 'green'])
  expect(Math.abs(view.overall - 149.5 / 240)).toBeLessThan(1e-9)
  expect(Math.abs(fillOf(stripOf(view), 'green') - (149.5 / 240) * view.barWidth)).toBeLessThan(1)
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

test('AC40 one verifying piece reads 75%', () => {
  expect(viewOf([piece('A', 'verifying')], { sessions: ONE_RUNNING }).percent).toBe(75)
})

test('AC43 two done and one dropped, one session waiting, nobody asking, nothing running read All 2 done', () => {
  const view = viewOf([piece('A', 'done'), piece('B', 'done'), piece('C', 'dropped')], { sessions: [sessionOf('local_a', 'waiting')], running: [] })
  expect([view.isAllDone, view.hasAllDone, view.allDone, countsText(view.parts), view.percent, view.tone]).toEqual([true, true, 'All 2 done', '', 100, 'green'])
  expect(view.alt).toMatch(/^Master session: all 2 done\. /)
})

test('T7 a plan of one done and one queued with every unit finished reads 50% 1/2 on a grey bar, with no all-done', () => {
  const view = viewOf([piece('A', 'done'), piece('B', 'queued')], { sessions: [sessionOf('local_a', 'done'), sessionOf('local_b', 'done')], running: [] })
  expect([view.isAllDone, view.percent, countsText(view.parts), view.tone, view.hasPercent]).toEqual([false, 50, '1/2', 'grey', true])
})

test('AC36 seven working sessions with no steps and two subagents read 0% and 0/9, with no counts words', () => {
  const sessions = Array.from({ length: 7 }, (_, index) => sessionOf(`local_${index}`, 'working'))
  const view = viewOf(undefined, { sessions, agents: [subagent('a'), subagent('b')] })
  expect([view.percent, countsText(view.parts)]).toEqual([0, '0/9'])
  expect(countsText(view.parts)).not.toMatch(/working|waiting|subagent|workflow/)
})

test('AC41 nine done and one verifying, no tiers, read 97% 9/10, never 100%', () => {
  const plan = [...Array.from({ length: 9 }, (_, index) => piece(`D${index}`, 'done')), piece('V', 'verifying')]
  const view = viewOf(plan, { sessions: ONE_RUNNING })
  expect([view.percent, countsText(view.parts)]).toEqual([97, '9/10'])
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
  expect([view.percent, countsText(view.parts), view.alt]).toEqual([50, '1/2', expect.stringMatching(/^Master session: 50 percent, 1 of 2 done\./)])
})

test('T6 a verifying piece stays at 75 over 2 through a fix round, and moving it back to working is accepted with a warning in the reply', () => {
  const view = viewOf([piece('A', 'verifying'), piece('B', 'queued')], { sessions: ONE_RUNNING })
  expect([view.percent, countsText(view.parts)]).toEqual([37, '0/2'])
  const back = mergePlan([piece('A', 'verifying', undefined, { since: 1 }), piece('B', 'queued', undefined, { since: 1 })], [piece('A', 'working', 'step 1 of 2 — x')], AT)
  expect(back.back).toEqual(['A'])
  expect(planNoteOf(back)).toContain('Moved back to working: A.')
  expect(back.plan.find(one => one.name === 'A')).toMatchObject({ state: 'working', since: AT })
})

test('T8 every piece done while a subagent runs reads 99% 3/3 on a green bar with the slider and no all-done check', () => {
  const view = viewOf([piece('A', 'done'), piece('B', 'done'), piece('C', 'done')], { agents: [subagent('s')] })
  expect([view.percent, countsText(view.parts), view.tone, view.isAllDone, view.isRunning, view.hasPercent]).toEqual([99, '3/3', 'green', false, true, true])
  expect(stripOf(view)).toContain('linearGradient')
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
  expect(viewOf(WORKED, { agents: [subagent('qa')] }).alt).toMatch(/^Master session: 62 percent, 3 of 7 done\./)
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
  expect([view.percent, countsText(view.parts), view.alt]).toEqual([80, '1/4', expect.stringMatching(/^Master session: 80 percent, 1 of 4 done\./)])
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

test('AC42 a piece working at step 4 of 4 reads 70%, then verifying 75%: moving to verifying never lowers the percent', () => {
  const working = viewOf([piece('A', 'working', 'step 4 of 4 — x')], { sessions: ONE_RUNNING }).percent
  const verifying = viewOf([piece('A', 'verifying')], { sessions: ONE_RUNNING }).percent
  expect([working, verifying]).toEqual([70, 75])
})

test('T4 weights: a done T3 and a queued T0 read 85%, the same plan with no tiers 50%', () => {
  expect(viewOf([piece('A', 'done', undefined, { tier: 'T3' }), piece('B', 'queued', undefined, { tier: 'T0' })]).percent).toBe(85)
  expect(viewOf([piece('A', 'done'), piece('B', 'queued')], { sessions: ONE_RUNNING }).percent).toBe(50)
})

test('T5 a T1 piece working with no progress is worth minutes over its 30 minute timebox, capped at 0.5, and a given progress wins', () => {
  const at = (minutes: number, progress?: string) => viewOf([piece('A', 'working', progress, { tier: 'T1', since: AT - minutes * MIN })], { sessions: ONE_RUNNING }).percent
  expect([at(6), at(20), at(60), at(6, 'step 1 of 4 — x')]).toEqual([20, 50, 50, 25])
})

test('the time-based value moves once a minute: the percent holds within a minute', () => {
  const at = (ms: number) => viewOf([piece('A', 'working', undefined, { tier: 'T0', since: AT - ms })], { sessions: ONE_RUNNING }).percent
  expect(at(MIN)).toBe(at(MIN + 59_000))
  expect(at(2 * MIN)).toBeGreaterThan(at(MIN + 59_000))
})

test('a since sent in the tool input is ignored', () => {
  expect(planOf([{ name: 'A', state: 'working', since: 5 }]).plan).toEqual([piece('A', 'working')])
})

test('an untiered piece is timed against 30 minutes', () => {
  expect(viewOf([piece('A', 'working', undefined, { since: AT - 15 * MIN })], { sessions: ONE_RUNNING }).percent).toBe(50)
})

test('T1 a call merges into the stored plan by name; a call with no plan keeps it', () => {
  const first = mergePlan(undefined, [piece('A', 'done'), piece('B', 'working'), piece('C', 'queued')], 10)
  const second = mergePlan(first.plan, [piece('B', 'verifying'), piece('D', 'queued')], 20)
  expect(second.plan.map(one => `${one.name}:${one.state}`)).toEqual(['A:done', 'B:verifying', 'C:queued', 'D:queued'])
  expect(second.plan.map(one => one.since)).toEqual([10, 20, 10, 20])
  expect(mergePlan(second.plan, undefined, 30).plan).toEqual(second.plan)
  expect(countsText(viewOf(second.plan, { sessions: ONE_RUNNING }).parts)).toBe('1/4')
})

test('T2 the reply names C as kept and the plan growing 3 to 4', () => {
  const first = mergePlan(undefined, [piece('A', 'done'), piece('B', 'working'), piece('C', 'queued')], 10)
  const second = mergePlan(first.plan, [piece('B', 'verifying'), piece('D', 'queued')], 20)
  expect([second.kept, second.back, planNoteOf(second)]).toEqual([['A', 'C'], [], 'Kept: A, C. Plan grew 3 → 4.'])
})

test('T3 a collapse replay: a call that lists only one done piece never drops done below 5 or the total below 8', () => {
  const stored = [...['a', 'b', 'c', 'd', 'e'].map(name => piece(name, 'done')), ...['f', 'g', 'h'].map(name => piece(name, 'queued'))]
  const merged = mergePlan(stored, [piece('Fixes merged', 'done')], 50)
  expect(countsText(viewOf(merged.plan, { sessions: ONE_RUNNING }).parts)).toBe('6/9')
})

test('a piece keeps its since while its state holds, and takes the call time when the state changes', () => {
  const first = mergePlan(undefined, [piece('A', 'working')], 10)
  expect(mergePlan(first.plan, [piece('A', 'working', 'step 1 of 2 — x')], 99).plan[0]?.since).toBe(10)
  expect(mergePlan(first.plan, [piece('A', 'verifying')], 99).plan[0]?.since).toBe(99)
})

test('AC44 a tier outside T0 T1 T2 T3 doc is refused naming plan, and the schema lists the optional tier', () => {
  const tier = BOARD_SCHEMA.properties.plan.items.properties.tier
  expect([tier.enum, BOARD_SCHEMA.properties.plan.items.required]).toEqual([['T0', 'T1', 'T2', 'T3', 'doc'], ['name', 'state']])
  const answer = planOf([{ name: 'A', state: 'queued', tier: 'T4' }])
  expect(answer.error).toContain('plan')
  expect(answer.plan).toBeUndefined()
  expect(planOf([{ name: 'A', state: 'queued', tier: 'T2' }]).plan).toEqual([piece('A', 'queued', undefined, { tier: 'T2' })])
})

test('T9 a stored plan of 100 not dropped pieces plus one more counts 101, past the cap of 100; dropped pieces do not count', () => {
  const stored = Array.from({ length: 100 }, (_, index) => piece(`P${index}`, 'queued'))
  expect(mergePlan(stored, [piece('extra', 'queued')], 5).now).toBe(101)
  expect(mergePlan(stored, [piece('extra', 'dropped')], 5).now).toBe(100)
  expect(PLAN_LIMIT).toBe(100)
})

test('T10 a stored piece keeps its since through a reload of the board, so a T1 piece working for 6 minutes is worth 20%', () => {
  const stored = mergePlan(undefined, [piece('A', 'working', undefined, { tier: 'T1' })], AT - 6 * MIN).plan
  const reloaded = boardFromJson(JSON.parse(JSON.stringify({ sessions: [], plan: stored })), 'file')
  expect(reloaded?.plan).toEqual(stored)
  expect(viewOf(reloaded?.plan, { sessions: ONE_RUNNING }).percent).toBe(20)
})

test('a board carries run through the parser', () => {
  expect(boardFromJson({ sessions: [], run: ' band ' }, 'tool')?.run).toBe('band')
  expect(boardFromJson({ sessions: [] }, 'tool')?.run).toBeUndefined()
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
