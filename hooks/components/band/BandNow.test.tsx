import { expect, test } from 'claude-code/testing'

import type { AgentRecord, Board, BoardSession, Live, Running, WorkflowRecord } from '../../../types'

import { CHECK, PERCENT } from '../../theme/band'
import { PILL_WIDTH, bandProgressWith, bandViewOf, countsWidthOf, nowTextOf } from '../../lib/band'
import { CH, widthOf } from '../../lib/layout'
import { guardSvg } from '../guard'
import { SELF, warmUp } from '../../testing/world'
import { Band } from './Band'
import { TextBand } from './TextBand'

const NOW = 3_600_000
const T0 = NOW - 48 * 60_000
const READ = { tool: 'Read', text: '~/Work/master-session-plugin/hooks/lib/rowfit.ts', since: NOW - 5_000 }
const NO_ACT = { board: () => undefined, chat: () => undefined }

const columnsFor = (width: number) => Math.ceil((width + 16) / CH)

warmUp()

type Piece = { id: string; title: string; state: BoardSession['state']; createdAt?: number; isRunning?: boolean; progress?: string; needsYou?: string }

const IMPL: Piece = { id: 'local_impl', title: 'Implementer · Row details', state: 'working', createdAt: T0 + 40 * 60_000, progress: 'step 2 of 5 — build' }

const agentOf = (id: string, extra: Partial<AgentRecord> = {}): AgentRecord => ({ id, name: id, type: 'master-session:qa-verifier', description: id, state: 'running', startedAt: T0, ...extra })

const QA = agentOf('a1', { name: 'row-detail a38c72e', startedAt: T0 })

function viewOf(pieces: Piece[], agents: AgentRecord[] = [], running: Record<string, Running> = {}, px = 760, workflows: WorkflowRecord[] = [], isPaneOpen = false) {
  const board: Board = { sessions: pieces.map(one => ({ id: one.id, name: one.id, title: one.title, state: one.state, progress: one.progress, needsYou: one.needsYou }) as BoardSession), needsYou: [], repos: [], source: 'tool' }
  const live: Live = {
    self: SELF,
    title: '',
    error: '',
    at: NOW,
    sessions: pieces.map(one => ({ id: one.id, name: one.id, title: one.title, cwd: '/', isRunning: one.isRunning ?? one.state === 'working', isArchived: false, lastActivityAt: NOW - 60_000, startedBy: SELF, createdAt: one.createdAt })),
  }
  const counts = { agents, workflows, at: NOW }
  const progress = bandProgressWith(board, live, counts)
  if (!progress) throw new Error('no band')
  return bandViewOf(columnsFor(px), board, progress, isPaneOpen, counts, NO_ACT, live, [], running)
}

const lineOf = (view: ReturnType<typeof viewOf>) => (view.now ? nowTextOf(view.now) : '')

test('two lines: the newest running piece with its glyph, name, the pane’s running text and "+N more", then the run’s elapsed', () => {
  const view = viewOf([IMPL], [QA], { local_impl: READ })
  expect(view.now).toEqual({ kind: 'running', icon: { name: 'implementer', alt: 'session' }, head: 'Implementer · Row details', tail: 'Read · ~/Work/master-session-plugin/hooks/lib/rowfit.ts', more: '+1 more' })
  expect(lineOf(view)).toBe('Implementer · Row details · Read · ~/Work/master-session-plugin/hooks/lib/rowfit.ts +1 more')
  expect([view.elapsed, view.hasElapsed, view.action?.label]).toEqual(['48m', true, 'Open board'])
  expect(view.alt).toBe('Master session: 20 percent, 0 of 2 done. Now Implementer · Row details, Read · ~/Work/master-session-plugin/hooks/lib/rowfit.ts, and 1 more running. 48m elapsed.')
})

test('newest: the later start wins, a tie goes to the first listed item, a newer subagent takes the line and the count rises', () => {
  const newer = agentOf('a2', { name: 'band-now', type: 'master-session:reviewer', startedAt: T0 + 45 * 60_000 })
  const view = viewOf([IMPL], [QA, newer], { local_impl: READ })
  expect([view.now?.head, view.now?.icon?.name, view.now?.icon?.alt, view.now?.more]).toEqual(['Code reviewer · band-now', 'reviewer', 'subagent', '+2 more'])
  const tied = viewOf([{ ...IMPL, createdAt: T0 }], [QA], { local_impl: READ })
  expect(tied.now?.head).toBe('Implementer · Row details')
})

test('one running piece has no "+N more"; between tool calls the line has no command and no dot', () => {
  const alone = viewOf([IMPL], [], { local_impl: READ })
  expect(alone.now?.more).toBe('')
  const idle = viewOf([IMPL], [QA], {})
  expect([idle.now?.tail, lineOf(idle)]).toEqual(['', 'Implementer · Row details +1 more'])
  expect(idle.alt).toContain('Now Implementer · Row details, and 1 more running.')
})

test('a workflow run counts once whatever its agents and shows its newest running agent’s command with the flow glyph', () => {
  const run = (index: number, state: AgentRecord['state'], at: number) => agentOf(`w${index}`, { type: 'workflow-subagent', state, startedAt: at, run: { id: 'wf_1', index } })
  const agents = [run(0, 'done', T0), run(1, 'running', T0 + 1_000), run(2, 'running', T0 + 2_000), run(3, 'running', T0 + 3_000)]
  const workflows: WorkflowRecord[] = [{ id: 'wf_1', toolUseId: 't', name: 'review-changes', phases: ['Scan'], startedAt: T0 }]
  const running = { w1: { tool: 'Read', text: '~/old.ts', since: NOW - 9_000 }, w3: { tool: 'Grep', since: NOW - 2_000 } }
  const view = viewOf([], agents, running, 760, workflows)
  expect([view.now?.icon, view.now?.head, view.now?.tail, view.now?.more]).toEqual([{ name: 'flow', alt: 'workflow' }, 'Workflow · review-changes', 'Grep', ''])
  const withSession = viewOf([IMPL], agents, running, 760, workflows)
  expect(withSession.now?.more).toBe('+1 more')
})

test('idle: "Nothing running" with the pane’s waiting count only when above 0, the bar grey', () => {
  const waiting = (id: string): Piece => ({ id, title: `Implementer · ${id}`, state: 'waiting', isRunning: false, progress: 'step 1 of 5 — x' })
  const view = viewOf([waiting('one'), waiting('two')])
  expect([lineOf(view), view.tone]).toEqual(['Nothing running · 2 waiting on you or a review', 'grey'])
  expect(view.alt).toContain('Nothing running, 2 waiting. ')
  const none = viewOf([{ id: 'local_old', title: 'Implementer · Old', state: 'done', isRunning: false, progress: 'step 5 of 5 — x' }, { ...IMPL, state: 'ready' as BoardSession['state'], isRunning: false }])
  expect(lineOf(none).includes('0 waiting')).toBe(false)
})

test('needs you: the pill names the tool only, never the command, path or host; one line with no now line, no elapsed', () => {
  const bash = viewOf([{ ...IMPL, state: 'needs-you', needsYou: 'Allow Bash: git push origin band-strip' }])
  expect(bash.pillText).toBe('Implementer · Row details needs you · Allow Bash')
  expect([bash.now, bash.hasElapsed, bash.tone]).toEqual([undefined, false, 'red'])
  expect(bash.alt).toBe('Master session: Implementer · Row details needs you, Allow Bash')
  const read = viewOf([{ ...IMPL, state: 'needs-you', needsYou: 'Allow Read: ~/notes/band.md' }])
  expect(read.pillText).toBe('Implementer · Row details needs you · Allow Read')
  const bare = viewOf([{ ...IMPL, state: 'needs-you', needsYou: 'Allow Bash' }])
  expect(bare.pillText).toBe('Implementer · Row details needs you · Allow Bash')
  for (const text of [bash.pillText, bash.alt, read.pillText, read.alt]) expect(/git push|band-strip|notes|band\.md/.test(text)).toBe(false)
  const longPath = viewOf([{ ...IMPL, state: 'needs-you', needsYou: 'Allow mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__batch: ~/secret/notes.md' }], [], {}, 1400)
  const longHost = viewOf([{ ...IMPL, state: 'needs-you', needsYou: 'Allow mcp__context-mode-local__ctx_fetch_and_index: internal.example.com' }], [], {}, 1400)
  expect(longPath.pillText).toBe('Implementer · Row details needs you · Allow mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__batch')
  expect(longPath.alt).toBe('Master session: Implementer · Row details needs you, Allow mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__batch')
  expect(longHost.pillText).toBe('Implementer · Row details needs you · Allow mcp__context-mode-local__ctx_fetch_and_index')
  for (const text of [longPath.pillText, longPath.alt, longHost.pillText, longHost.alt]) expect(/secret|notes|example/.test(text)).toBe(false)
  const subagent = viewOf([IMPL], [agentOf('a1', { type: 'master-session:reviewer', name: 'band-now', asking: { text: 'Allow Read: ~/notes/band.md', since: 1 } })])
  expect(subagent.pillText).toMatch(/^Code reviewer.* needs you · Allow Read$/)
  expect(subagent.action).toBeUndefined()
})

test('all done: the check, a full bar and no fraction; line 2 "All N done" with the latest event; the elapsed stays', () => {
  const done = (id: string, at: number): Piece => ({ id, title: `Implementer · ${id}`, state: 'done', isRunning: false, progress: 'step 5 of 5 — x', createdAt: at })
  const view = viewOf([done('one', T0), done('two', T0 + 60_000)])
  expect([view.isAllDone, view.showCounts, view.parts, view.hasPercent, view.tone]).toEqual([true, false, [], false, 'green'])
  expect(view.now?.head).toBe('All 2 done')
  expect(view.now?.icon).toEqual({ name: 'merged', alt: 'all done' })
  expect(view.now?.tail).toMatch(/ · one$/)
  expect(view.alt).toMatch(/^Master session: all 2 done\. Latest .* · one\. 48m elapsed\.$/)
  expect([view.elapsed, view.hasElapsed]).toEqual(['48m', true])
})

test('widths: 600 and up everything, 340 to 599 the name only and no elapsed, below 340 the bar alone and the persona alone', () => {
  const full = viewOf([IMPL], [QA], { local_impl: READ }, 610)
  expect([full.now?.tail, full.now?.more, full.hasElapsed, full.action?.label]).toEqual(['Read · ~/Work/master-session-plugin/hooks/lib/rowfit.ts', '+1 more', true, 'Open board'])
  const mid = viewOf([IMPL], [QA], { local_impl: READ }, 590)
  expect([mid.now?.head, mid.now?.tail, mid.now?.more, mid.hasElapsed, mid.action?.label, mid.hasPercent, mid.showCounts]).toEqual(['Implementer · Row details', '', '', false, 'Board', true, true])
  const low = viewOf([IMPL], [QA], { local_impl: READ }, 330)
  expect([low.now?.head, low.now?.tail, low.now?.more, low.hasElapsed, low.action?.label, low.hasPercent, low.showCounts]).toEqual(['Implementer', '', '', false, 'Board', false, false])
  expect(low.barWidth).toBeGreaterThanOrEqual(48)
  expect(low.alt).toBe(full.alt)
  expect(viewOf([IMPL], [QA], { local_impl: READ }, 345).hasPercent).toBe(true)
  const wait = viewOf([{ id: 'local_w', title: 'Implementer · W', state: 'waiting', isRunning: false, progress: 'step 1 of 5 — x' }, { id: 'local_v', title: 'Implementer · V', state: 'waiting', isRunning: false, progress: 'step 1 of 5 — x' }], [], {}, 330)
  expect(lineOf(wait)).toBe('Nothing running')
  expect(lineOf(viewOf([{ id: 'local_w', title: 'Implementer · W', state: 'waiting', isRunning: false, progress: 'step 1 of 5 — x' }], [], {}, 390))).toBe('Nothing running · 1 waiting on you or a review')
})

test('the widths of the row add up to the band width within 2 px at every width and state', () => {
  for (let px = 250; px <= 1100; px += 7) {
    for (const view of [viewOf([IMPL], [QA], { local_impl: READ }, px), viewOf([IMPL], [], {}, px, [], true), viewOf([{ ...IMPL, state: 'done', isRunning: false }], [], {}, px)]) {
      const width = columnsFor(px) * CH - 16
      const lead = view.hasPercent ? PERCENT : view.isAllDone ? CHECK : 0
      const counts = view.showCounts ? countsWidthOf(view.parts) : 0
      const sides = [lead, counts, view.hasElapsed ? view.elapsedWidth : 0, view.actionWidth].filter(Boolean)
      const row = view.padLeft + view.padRight + 2 + sides.reduce((sum, one) => sum + one, 0) + sides.length * view.gap + view.barWidth
      expect(Math.abs(row - width) <= 2 || view.barWidth === 48).toBe(true)
    }
    const ask = viewOf([{ ...IMPL, state: 'needs-you', needsYou: 'Allow Bash: x' }], [], {}, px)
    const width = columnsFor(px) * CH - 16
    const sides = [PILL_WIDTH + widthOf(ask.pillText, { isBold: true }), ask.actionWidth].filter(Boolean)
    expect(ask.padLeft + ask.padRight + 2 + sides.reduce((sum, one) => sum + one, 0) + sides.length * ask.gap + ask.barWidth <= width + 2).toBe(true)
  }
})

test('the elapsed is the pane’s duration: <1m, 48m, 1h 38m, counting from the oldest record', () => {
  const at = (ms: number) => {
    const piece: Piece = { ...IMPL, createdAt: NOW - ms }
    return viewOf([piece]).elapsed
  }
  expect([at(30_000), at(48 * 60_000), at(98 * 60_000)]).toEqual(['<1m', '48m', '1h 38m'])
})

test('desktop draw: line 1 is the percent, the bar and 3/7 as one count, line 2 the glyph and one text; the bar alt holds both lines', async ($, on) => {
  const view = viewOf([IMPL], [QA], { local_impl: READ })
  on('ui.render', { component: 'Pane', requestId: 'now-probe' }, ($, event) => {
    const table = $.ui.resolve(event)
    const { Box, Button, Text } = table
    return event.surface !== 'terminal' && 'Svg' in table ? Band({ Box, Text, Button, Svg: guardSvg(table.Svg, Text) }, { view }) : TextBand({ Box, Text, Button }, { view, columns: 100 })
  })
  const props = { title: 'band', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 6 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'master-session', component: 'Pane', requestId: 'now-probe', surface: 'vscode', props } as never)
  const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text)
  expect(texts).toContain('Implementer · Row details · Read · ~/Work/master-session-plugin/hooks/lib/rowfit.ts +1 more')
  expect(texts).toContain('48m')
  const alts = (await ui.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
  expect(alts).toEqual(expect.arrayContaining([view.alt, 'session', 'elapsed']))
  expect(texts.some(one => /working|waiting|subagent|workflow/.test(one))).toBe(false)
  await ui.unmount()
  const term = await $.ui.mount({ plugin: 'master-session', component: 'Pane', requestId: 'now-probe', surface: 'terminal', props } as never)
  const rows = (await term.findAll({ type: 'Text' })).map(one => one.text)
  expect(rows).toContain('Implementer · Row details · Read · ~/Work/master-session-plugin/hooks/lib/rowfit.ts +1 more')
  expect(rows).toContain('48m')
  expect(rows.some(one => /^ *\d+%$/.test(one))).toBe(true)
  await term.unmount()
})

test('terminal rows: the bash line is the tool only, idle and all done read as the desktop, narrow keeps the bar and the persona', async ($, on) => {
  const views = {
    bash: viewOf([IMPL], [QA], { local_impl: { tool: 'Bash', since: NOW - 1_000 } }),
    idle: viewOf([{ id: 'local_w', title: 'Implementer · W', state: 'waiting', isRunning: false, progress: 'step 1 of 5 — x' }, { id: 'local_v', title: 'Implementer · V', state: 'waiting', isRunning: false, progress: 'step 1 of 5 — x' }]),
    done: viewOf([{ ...IMPL, state: 'done', isRunning: false }]),
    narrow: viewOf([IMPL], [QA], { local_impl: READ }, 300),
  }
  const current = { view: views.bash }
  on('ui.render', { component: 'Pane', requestId: 'now-term' }, ($, event) => {
    const { Box, Button, Text } = $.ui.resolve(event)
    return TextBand({ Box, Text, Button }, { view: current.view, columns: Math.round(Number(event.props.bodyColumns)) })
  })
  const mountAt = (columns: number) => $.ui.mount({ plugin: 'master-session', component: 'Pane', requestId: 'now-term', surface: 'terminal', props: { title: 'band', isFocused: false, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 6 }, view: {} } } as never)
  const read = async (view: ReturnType<typeof viewOf>, columns = 100) => {
    current.view = view
    const ui = await mountAt(columns)
    const out = { texts: (await ui.findAll({ type: 'Text' })).map(one => one.text), buttons: (await ui.findAll({ type: 'Button' })).map(one => String(one.props.label)) }
    await ui.unmount()
    return out
  }
  const bash = await read(views.bash)
  expect(bash.texts).toContain('Implementer · Row details · Bash +1 more')
  expect(bash.buttons).toEqual(['Open board'])
  expect((await read(views.idle)).texts).toContain('Nothing running · 2 waiting on you or a review')
  const done = await read(views.done)
  expect(done.texts).toEqual(expect.arrayContaining(['✓', '8m']))
  expect(done.texts.some(one => one.startsWith('All 1 done'))).toBe(true)
  expect(done.texts.some(one => /\d\/\d/.test(one))).toBe(false)
  const narrow = await read(views.narrow, columnsFor(300))
  expect(narrow.texts).toContain('Implementer')
  expect(narrow.buttons).toEqual(['Board'])
  expect(narrow.texts.some(one => /%|\d\/\d|\dm$/.test(one))).toBe(false)
})
