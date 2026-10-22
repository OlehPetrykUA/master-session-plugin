import { expect, test } from 'claude-code/testing'
import type { Engine, FoundElement } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Board, BoardSession, Live, WorkflowRecord } from '../../../types'

import { agentCountsOf, bandAction, bandProgress, bandProgressWith, bandViewOf, extrasOf, fitBand, slotWidth } from '../../lib/band'
import type { AgentCounts } from '../../lib/band'
import { CH, COLUMN, across, tall, widthOf } from '../../lib/layout'
import { freshReport, merge } from '../../data/contract'
import { progressOf } from '../../lib/board'
import { rowsOf } from '../../lib/rows'
import { BAND, BOARD_TOOL, PANE, SELF, SPAWN, click, dump, started, text, world } from '../../testing/world'
import { PERCENT } from '../../theme/band'
import { I } from '../../theme/icons'
import { barsWidth, dotsWidth, strip } from '../../theme/strip'
import type { StripItem, StripTone } from '../../theme/strip'
import { guardSvg } from '../guard'
import { Band } from './Band'
import { TextBand } from './TextBand'

const PROBE = 'band-probe'

const ICON = Object.fromEntries(Object.entries(I).map(([name, path]) => [path, name]))

const WORKING: BoardSession[] = [
  { id: 'local_a', name: 'setup-ui-redo', state: 'waiting', progress: 'step 4 of 5 — mockups' },
  { id: 'local_b', name: 'mod-ui', state: 'working', progress: 'step 3 of 5 — pane' },
  { id: 'local_c', name: 'mod-data', state: 'working', progress: 'step 4 of 5 — reports' },
  { id: 'local_d', name: 'conductor-redo', state: 'done', progress: 'step 5 of 5 — shipped' },
]

const NEEDS: BoardSession[] = [{ id: 'local_e', name: 'env-e2e-test', state: 'needs-you', progress: 'step 1 of 2 — fix', needsYou: 'commit blocked' }, ...WORKING]

const DONE: BoardSession[] = WORKING.map(one => ({ ...one, state: 'done' }))

const boardOf = (sessions: BoardSession[]): Board => ({ sessions, needsYou: [], repos: [], source: 'tool' })

const publish = (sessions: BoardSession[]) => ({ tick: '09:00', sessions, needsYou: [], repos: [] })

const liveOf = (archived: string[] = [], workers: BoardSession[] = NEEDS, idle: string[] = []): Live => ({
  self: SELF,
  title: '',
  error: '',
  at: 0,
  sessions: workers.map(one => ({ id: one.id, name: one.name, title: '', cwd: '/', isRunning: !idle.includes(one.id), isArchived: archived.includes(one.id), lastActivityAt: 0, startedBy: SELF })),
})

type Linked = { sessionId: string; name: string; title: string; cwd: string; isRunning: boolean; isArchived: boolean; lastActivityAt: string; startedBy?: string }

const linkedOf = (id: string, name: string, isRunning: boolean, isArchived = false): Linked => ({ sessionId: id, name, title: name, cwd: '/', isRunning, isArchived, lastActivityAt: '1970-01-01T00:50:00.000Z', startedBy: SELF })

type McpHook = (context: unknown, event: { tool: string }) => unknown

async function band($: Engine, on: On, sessions: BoardSession[], isPaneOpen = false, linked: Linked[] = []) {
  let isOpen = isPaneOpen
  on('ui.panes', () => ({ value: isOpen ? [{ id: 'master-session', title: 'Master session', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  const register = on as unknown as (event: string, ...rest: unknown[]) => unknown
  const scoped = (event: string, ...rest: unknown[]) => {
    if (event === 'ui.panes') return undefined
    if (event !== 'mcp.call') return register(event, ...rest)
    const inner = rest[0] as McpHook
    return register(event, (context: unknown, call: { tool: string }) => (call.tool === 'list_sessions' ? text(linked) : inner(context, call)))
  }
  const run = await started($, scoped as unknown as On, publish(sessions))
  return { ...run, open: (value: boolean) => (isOpen = value) }
}

const mount = ($: Engine, bodyColumns = 100) => $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns } })

const IDLE = { agents: [], workflows: [] }

const S = (tone: StripTone, fill: number, isWorking = false): StripItem => ({ kind: 'session', tone, fill, isWorking })

const A = (tone: StripTone): StripItem => ({ kind: 'subagent', tone, fill: 1, isChild: true })

const W = (tone: StripTone, fill: number, pieces: number): StripItem => ({ kind: 'workflow', tone, fill, pieces })

const sessionsOf = (count: number) => Array.from({ length: count }, () => S('green', 0))

function crewOf($: Engine, on: On) {
  let running: string[] = []
  let runs = 0
  on('agent.spawn', (_, event) => {
    const agentId = event.workflow ? `${event.workflow.runId}-${event.workflow.agentIndex}` : event.description
    running = event.workflow ? running : [...running, agentId]
    return { model: 'claude-haiku-5-5', agentId }
  })
  on('agent.list', () => ({ value: running.map(id => ({ id, description: id, type: 'general-purpose', status: 'running' as const })) }))
  on('turn.complete', (_, event) => {
    running = running.filter(id => id !== event.agentId)
    return { text: event.answer }
  })
  on('tool.call', { tool: 'Workflow' }, () => {
    runs += 1
    return { result: { status: 'async_launched' as const, taskId: `task${runs}`, taskType: 'local_workflow' as const, workflowName: 'review-changes', runId: `wf_${runs}`, summary: 'Review' }, text: 'Workflow launched in background.' }
  })
  return {
    subagent: (description: string) => $.agent.spawn({ ...SPAWN, description, subagentType: 'general-purpose' }),
    workflow: async (agents: number) => {
      await $.tool.call({ tool: 'Workflow', script: "export const meta = { name: 'review-changes' }" })
      for (const index of [...Array(agents).keys()]) await $.agent.spawn({ ...SPAWN, description: `scan ${index}`, subagentType: 'workflow-subagent', workflow: { runId: `wf_${runs}`, agentIndex: index } })
    },
    finish: (agentId: string) => $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: `turn-${agentId}`, agentId, reason: 'answer' }),
  }
}

const countsOf = async ($: Engine, bodyColumns = 100) => {
  const ui = await mount($, bodyColumns)
  const texts = await ui.findAll({ type: 'Text' })
  const strip = await stripOf(ui)
  const found = {
    texts: await textsOf(ui),
    extras: texts.filter(one => one.props.weight === 'semibold' && one.props.color === 'text' && !one.text.includes(' needs you')).map(one => one.text),
    alt: strip?.props.alt,
    segments: pills(pathOf(String(strip?.props.source), 'track')),
  }
  await ui.unmount()
  return found
}

type Found = { findAll: (query: { type?: string }) => Promise<FoundElement[]>; find: (query: { key?: string }) => Promise<FoundElement | undefined> }

const isFace = (one: FoundElement) => one.type === 'Svg' && String(one.props.source).includes('<rect x="0.5"')

const isHot = (one: FoundElement) => /fill:var\(--(?:accentBtnHover|accentTint2)\)/.test(String(one.props.source))

const textsOf = async (ui: Found) => (await ui.findAll({})).flatMap(one => (one.type === 'Text' ? [one.text.replace(/[\u2007\u2009]/g, '').trim()] : isFace(one) && !isHot(one) ? [String(one.props.alt)] : []))

const buttonsOf = async (ui: Found) => (await ui.findAll({ type: 'Button' })).map(one => [one.key, String(one.props.label)])

const hitsOf = async (ui: Found) => (await ui.findAll({ type: 'Client' })).map(one => [one.key, one.props.module, one.props.props])

const stripOf = async (ui: Found) => (await ui.findAll({ type: 'Svg' })).find(one => one.props.isInteractive === true)

const widthOfStrip = async (ui: Found) => Number(String((await stripOf(ui))?.props.source).match(/viewBox="0 0 ([\d.]+) 10"/)?.[1])

const iconsOf = async (ui: Found) => (await ui.findAll({ type: 'Svg' })).filter(one => one.props.isInteractive !== true && !isHot(one)).map(one => ICON[String(one.props.source).match(/<path d="([^"]+)"/)?.[1] ?? ''] ?? '?')

const scopesOf = async (ui: Found) => (await ui.findAll({ type: 'Box' })).flatMap(one => (one.key ? [one.key] : []))

const pathOf = (source: string, tone: string) => source.match(new RegExp(`<path(?: class="s")? d="([^"]*)" style="fill:var\\(--${tone}\\)"/>`))?.[1] ?? ''

const pills = (path: string) => path.split('M').filter(Boolean).length

const BARS = [A('green'), A('failed'), S('green', 0.6), A('green'), A('grey'), S('amber', 0.8), S('red', 16.3 / 32.5), W('green', 1.505 / 3, 3)]

const DOTS = [A('green'), A('red'), S('green', 0.4), A('green'), A('grey'), S('amber', 0.5), S('red', 0.5), W('green', 0.5, 2), S('green', 0.4), A('green'), S('grey', 1), S('green', 0.4), A('green'), A('green'), W('green', 0.5, 1), S('amber', 0.5)]

test('the strip draws lane 7 at 200 px: sessions 10 high, subagents 6×12 after their parent, workflow pieces with 2 px corners, gaps 4 and 2', () => {
  const source = strip(200, BARS)
  const session = (x: number, length: number) => `M${x.toFixed(1)},0h${length.toFixed(1)}a5,5 0 0 1 0,10h-${length.toFixed(1)}a5,5 0 0 1 0,-10Z`
  const sub = (x: number) => `M${x.toFixed(1)},2h6.0a3,3 0 0 1 0,6h-6.0a3,3 0 0 1 0,-6Z`
  const piece = (x: number, length: number) => `M${x.toFixed(1)},0h${length.toFixed(1)}a2,2 0 0 1 2,2v6a2,2 0 0 1 -2,2h-${length.toFixed(1)}a2,2 0 0 1 -2,-2v-6a2,2 0 0 1 2,-2Z`
  expect(pathOf(source, 'track')).toBe(session(35, 22.5) + session(99.5, 22.5) + session(136, 22.5) + piece(169.5, 5.5) + piece(181, 5.5) + piece(192.5, 5.5))
  expect(pathOf(source, 'grey')).toBe(sub(81.5) + piece(169.5, 5.5))
  expect(pathOf(source, 'amber')).toBe(session(99.5, 16))
  expect(pathOf(source, 'green')).toBe(sub(3) + session(35, 9.5) + sub(67.5) + piece(181, 0.8))
  expect(source).toContain(`<path d="${sub(17)}" style="fill:var(--red)"/>`)
  expect(source).toContain(`<path class="s" d="${session(136, 6.3)}" style="fill:var(--red)"/>`)
  const finished = [S('grey', 1), A('grey'), W('grey', 1, 2)]
  expect(pathOf(strip(200, finished, 'done'), 'grey')).toBe('')
  expect(pills(pathOf(strip(200, finished, 'done'), 'green'))).toBe(4)
})

test('the strip draws lane 7 dots at 162 px: circle 8 for a session, dot 6 for a subagent, square 8 for a workflow run', () => {
  expect(dotsWidth(DOTS)).toBe(162)
  const source = strip(162, DOTS, 'live', true)
  const dot = (x: number, radius: number) => `M${x.toFixed(1)},5m-${radius},0a${radius},${radius} 0 1 0 ${2 * radius},0a${radius},${radius} 0 1 0 -${2 * radius},0Z`
  const square = (x: number) => `M${x.toFixed(1)},1h4a2,2 0 0 1 2,2v4a2,2 0 0 1 -2,2h-4a2,2 0 0 1 -2,-2v-4a2,2 0 0 1 2,-2Z`
  expect(pathOf(source, 'track')).toBe('')
  expect(pathOf(source, 'grey')).toBe(dot(39, 3) + dot(106, 4))
  expect(pathOf(source, 'amber')).toBe(dot(50, 4) + dot(158, 4))
  expect(pathOf(source, 'green')).toBe(dot(3, 3) + dot(22, 4) + dot(31, 3) + square(72) + dot(86, 4) + dot(95, 3) + dot(118, 4) + dot(127, 3) + dot(135, 3) + square(144))
  expect(pathOf(source, 'red')).toBe(dot(11, 3) + dot(62, 4))
  expect(dotsWidth(sessionsOf(5))).toBe(56)
})

test('the strip animates only a sweep inside working session fills and a red pulse for needs you, never for a failed one, and stops under reduced motion', () => {
  const calm = strip(340, [S('amber', 0.5), S('grey', 1), A('failed'), W('failed', 1, 2)])
  expect(calm).not.toContain('<animate')
  const busy = strip(340, [S('green', 0.6, true), S('green', 0.8, true), S('amber', 0.8), A('green')])
  expect(busy.match(/<animateTransform attributeName="transform" type="translate"/g)).toHaveLength(2)
  expect(busy.match(/dur="2.4s"/g)).toHaveLength(2)
  expect(busy).toContain('clip-path="url(#s0)"')
  expect(busy).not.toContain('<animate ')
  expect(busy).not.toContain('<rect')
  expect(busy).toContain('@media (prefers-reduced-motion: reduce){.m{display:none}.s{display:inline}}')
  const asking = strip(280, [S('red', 0.5), S('green', 0.6, true), A('red')], 'dim')
  expect(asking).toContain('<g opacity=".35">')
  expect(asking).toContain('<animate attributeName="opacity" values="1;.4;1" dur="2.4s"')
  expect(asking).not.toContain('animateTransform')
  expect(strip(2000, Array.from({ length: 40 }, () => S('green', 0.7, true))).length).toBeLessThan(131_072)
})

test('no band with no board and no worker of mine, with an empty board and no workers, or with every worker archived; archived ones drop out', () => {
  const outsider = { id: 'local_x', name: 'outsider', title: '', cwd: '/', isRunning: true, isArchived: false, lastActivityAt: 0 }
  expect(bandProgress(null, { ...liveOf([], []), sessions: [outsider] })).toBeUndefined()
  expect(bandProgress(boardOf([]), liveOf([], []))).toBeUndefined()
  expect(bandProgress(boardOf(WORKING), liveOf(WORKING.map(one => one.id), WORKING))).toBeUndefined()
  expect(bandProgress(boardOf(NEEDS), liveOf(['local_b']))?.segments.map(one => one.id)).toEqual(['local_e', 'local_a', 'local_c', 'local_d'])
  expect(bandProgress(boardOf(WORKING), liveOf([], WORKING))?.segments.map(one => one.fill)).toEqual([0.8, 0.6, 0.8, 1])
})

test('band segments are the pane rows: linked workers the board misses count, running as working and idle as waiting', () => {
  const ids = (sessions: { id: string }[] | undefined) => (sessions ?? []).map(one => one.id)
  const four = liveOf([], WORKING)
  expect(progressOf(boardOf([]), four).total).toBe(0)
  expect(bandProgress(boardOf([]), four)?.total).toBe(4)
  expect(bandProgress(null, four)?.total).toBe(4)
  const stale = boardOf(WORKING.slice(0, 2))
  const oneIdle = liveOf([], WORKING, ['local_d'])
  expect(progressOf(stale, oneIdle).total).toBe(2)
  expect(bandProgress(stale, oneIdle)?.segments.map(one => [one.id, one.state])).toEqual([
    ['local_a', 'waiting'],
    ['local_d', 'waiting'],
    ['local_b', 'working'],
    ['local_c', 'working'],
  ])
  const archived = liveOf(['local_c'], WORKING, ['local_d'])
  expect(ids(bandProgress(stale, archived)?.segments)).toEqual(['local_a', 'local_d', 'local_b'])
  const asking = merge(boardOf([]), [{ ...freshReport('local_c', SELF, 'engine-c', 0), state: 'needs-you', needsYou: 'approve the plan' }], four, 0)
  expect(bandProgress(asking, four)?.segments.map(one => [one.id, one.state])).toEqual([
    ['local_c', 'needs-you'],
    ['local_a', 'working'],
    ['local_b', 'working'],
    ['local_d', 'working'],
  ])
  for (const [board, live] of [[boardOf([]), four], [stale, oneIdle], [stale, archived], [asking, four], [boardOf(NEEDS), liveOf(['local_b'])], [null, four]] as const) {
    expect(ids(bandProgress(board, live)?.segments)).toEqual(ids(rowsOf(board, live)))
  }
})

test('the band draws every linked worker on a stale board: 2 of 4 published gives 4 segments, live counts, and the pane draws the same 4 rows', async ($, on) => {
  await band($, on, WORKING.slice(0, 2), false, WORKING.map((one, index) => linkedOf(one.id, one.name, index !== 3)).concat(linkedOf('local_z', 'gone', false, true)))
  const found = await countsOf($)
  expect(found.segments).toBe(4)
  expect(found.texts).toEqual(['35%', '2 working · 2 waiting', 'Open board'])
  expect(found.alt).toBe('Master session: 35 percent, 2 working, 2 waiting')
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const rows = (await pane.findAll({ type: 'Box' })).flatMap(box => box.key?.match(/^row-(local_\w+)$/)?.slice(1) ?? [])
  await pane.unmount()
  expect(rows.sort()).toEqual(['local_a', 'local_b', 'local_c', 'local_d'])
})

test('band presses route by Client key: band-hit-board and -chat; no summary any more; the pane’s hit- keys are not the band’s', () => {
  expect(bandAction('band-hit-board')).toBe('board')
  expect(bandAction('band-hit-chat')).toBe('chat')
  expect(bandAction('band-hit-summary')).toBeUndefined()
  expect(bandAction('band-hit-other')).toBeUndefined()
  expect(bandAction('hit-tile-local_a')).toBeUndefined()
})

test('the strip stretches by flex: bars fill the box that takes the leftover width, dots keep their width in a growing holder with the counts after them', async ($, on) => {
  await band($, on, WORKING)
  const ui = await mount($)
  const strip = await stripOf(ui)
  expect(strip?.props.width).toBeUndefined()
  expect(String(strip?.props.source)).toMatch(/^<svg [^>]*height="10" viewBox="0 0 [\d.]+ 10" preserveAspectRatio="none">/)
  const holder = (await ui.findAll({ type: 'Box' })).find(box => box.props.flexGrow === 1 && box.props.width === 0)
  expect(holder?.props).toEqual(expect.objectContaining({ flexDirection: 'column', alignItems: 'stretch', flexGrow: 1, flexShrink: 1, width: 0, minWidth: 0 }))
  expect(JSON.stringify(holder?.children)).toContain('preserveAspectRatio')
  await ui.unmount()
  const many: BoardSession[] = [...Array(10).keys()].map(index => ({ id: `local_${index}`, name: `w${index}`, state: 'working', progress: 'step 1 of 2 — x' }))
  await $.tool.call({ tool: BOARD_TOOL, ...publish(many) })
  const dots = await mount($)
  expect((await stripOf(dots))?.props.width).toBe(dotsWidth(sessionsOf(10)))
  const growing = (await dots.findAll({ type: 'Box' })).filter(box => box.props.flexGrow === 1 && box.props.width === undefined)
  expect(growing.map(box => box.props.flexShrink)).toEqual([0])
  expect(JSON.stringify(growing[0]?.children)).toContain('10 working')
  await dots.unmount()
})

test('every icon is drawn with its name as alt, the counts icon included', async ($, on) => {
  await band($, on, WORKING)
  const work = await mount($)
  const icons = (await work.findAll({ type: 'Svg' })).filter(one => one.props.isInteractive !== true && !isFace(one))
  expect(icons.map(one => one.props.alt)).toEqual(['pulse'])
  expect((await work.findAll({ type: 'Svg' })).filter(one => isFace(one) && !isHot(one)).map(one => one.props.alt)).toEqual(['Open board'])
  expect(await iconsOf(work)).toEqual(['pulse', 'panel'])
  await work.unmount()
  await $.tool.call({ tool: BOARD_TOOL, ...publish(DONE) })
  const done = await mount($)
  expect((await done.findAll({ type: 'Svg' })).filter(one => one.props.isInteractive !== true && !isFace(one)).map(one => one.props.alt)).toEqual(['check', 'done'])
  await done.unmount()
})

test('working, pane closed: percent, counts, and Open board pressable over its whole face opens the pane', async ($, on) => {
  const { opened } = await band($, on, WORKING)
  const ui = await mount($)
  await dump('band-working', ui)
  const strip = await stripOf(ui)
  expect(strip?.props.alt).toBe('Master session: 80 percent, 2 working, 1 waiting')
  expect(strip?.props.isInteractive).toBe(true)
  expect(pills(pathOf(String(strip?.props.source), 'track'))).toBe(4)
  expect(await textsOf(ui)).toEqual(['80%', '2 working · 1 waiting', 'Open board'])
  expect(await buttonsOf(ui)).toEqual([])
  const [hit] = await hitsOf(ui)
  const columns = (hit?.[2] as { columns: number }).columns
  expect(hit).toEqual(['band-hit-board', 'hooks/components/press.tsx', { id: 'band-hit-board', columns, rows: 2 }])
  expect(columns * CH).toBeGreaterThanOrEqual(Number((await ui.find({ key: 'face-band-board' }))?.props.width) * CH)
  expect(await scopesOf(ui)).toEqual(['face-band-board'])
  await click(ui, 'band-hit-board', columns - 1, 1)
  expect(opened).toEqual(['master-session'])
  await ui.unmount()
})

test('pane open: no Board button, the segments take its room, and opening or closing the pane redraws the band', async ($, on) => {
  const run = await band($, on, WORKING)
  const ui = await mount($)
  const closed = await widthOfStrip(ui)
  const faceWidth = Number((await ui.find({ key: 'face-band-board' }))?.props.width) * CH
  run.open(true)
  await click(ui, 'band-hit-board', 1, 1)
  await run.clock.settle()
  await dump('band-pane-open', ui)
  expect(await textsOf(ui)).toEqual(['80%', '2 working · 1 waiting'])
  expect(await hitsOf(ui)).toEqual([])
  expect(await scopesOf(ui)).toEqual([])
  expect(Math.abs((await widthOfStrip(ui)) - (closed + faceWidth + 12))).toBeLessThanOrEqual(1)
  await ui.unmount()
})

test('segments fill the remaining width and follow bodyColumns', async ($, on) => {
  await band($, on, WORKING)
  const at100 = await mount($, 100)
  const wide = await widthOfStrip(at100)
  await at100.unmount()
  const at120 = await mount($, 120)
  expect((await widthOfStrip(at120)) - wide).toBe(Math.round(20 * COLUMN))
  await at120.unmount()
  expect(wide).toBeGreaterThan(300)
})

test('no jumping: tabular percent and counts in fixed slots keep the segments the same width as the numbers change', async ($, on) => {
  expect(slotWidth('1 working · 2 waiting', 13)).toBe(slotWidth('2 working · 1 waiting', 13))
  expect(slotWidth('9 working · 9 waiting', 13)).toBe(slotWidth('10 working · 12 waiting', 13))
  await band($, on, WORKING)
  const before = await mount($)
  const width = await widthOfStrip(before)
  expect((await before.findAll({ type: 'Text' })).filter(one => one.props.tabular).map(one => one.text)).toEqual(['80%', '2 working · 1 waiting'])
  const percent = (await before.findAll({ type: 'Text' })).find(one => one.text === '80%')
  expect(percent?.props).toEqual(expect.objectContaining({ weight: 'semibold', size: 'heading', tabular: true }))
  expect((await before.findAll({ type: 'Box' })).some(box => box.props.width === across(PERCENT) && JSON.stringify(box.children).includes('80%'))).toBe(true)
  await before.unmount()
  await $.tool.call({ tool: BOARD_TOOL, ...publish([{ ...WORKING[0]!, progress: 'step 0 of 5 — x' }, { ...WORKING[1]!, state: 'waiting', progress: 'step 0 of 5 — x' }, WORKING[2]!, WORKING[3]!]) })
  const after = await mount($)
  expect(await textsOf(after)).toEqual(['45%', '1 working · 2 waiting', 'Open board'])
  expect(await widthOfStrip(after)).toBe(width)
  await after.unmount()
})

test('needs you: red pill with the reason, dimmed segments filling the rest, Open chat opens that worker', async ($, on) => {
  const { calls } = await band($, on, NEEDS, true)
  const ui = await mount($)
  await dump('band-needs-you', ui)
  const strip = await stripOf(ui)
  expect(strip?.props.alt).toBe('Master session: env-e2e-test needs you, commit blocked')
  expect(String(strip?.props.source)).toContain('<g opacity=".35">')
  expect(pills(pathOf(String(strip?.props.source), 'track'))).toBe(5)
  expect(await textsOf(ui)).toEqual(['env-e2e-test needs you · commit blocked', 'Open chat'])
  expect((await hitsOf(ui)).map(one => one[0])).toEqual(['band-hit-chat'])
  expect(await scopesOf(ui)).toEqual(['face-band-chat'])
  await click(ui, 'band-hit-chat', 1, 0)
  expect(calls.filter(one => one.tool === 'open_session_in').map(one => one.args.session_id)).toEqual(['local_e'])
  await ui.unmount()
})

test('all done: check, full green fills, counts, and Open board with the board icon, hidden while the pane is open', async ($, on) => {
  const run = await band($, on, DONE)
  const ui = await mount($)
  await dump('band-all-done', ui)
  const strip = await stripOf(ui)
  expect(strip?.props.alt).toBe('Master session: all 4 done')
  expect(pills(pathOf(String(strip?.props.source), 'green'))).toBe(4)
  expect(pathOf(String(strip?.props.source), 'grey')).toBe('')
  expect(String(strip?.props.source)).not.toContain('<animate')
  expect(await textsOf(ui)).toEqual(['4 done · 0 open', 'Open board'])
  expect(await iconsOf(ui)).toEqual(['check', 'done', 'panel'])
  expect((await hitsOf(ui)).map(one => one[0])).toEqual(['band-hit-board'])
  run.open(true)
  await click(ui, 'band-hit-board', 2, 1)
  await run.clock.settle()
  expect(run.opened).toEqual(['master-session'])
  expect(await textsOf(ui)).toEqual(['4 done · 0 open'])
  await ui.unmount()
})

const BREAKPOINTS = [
  { px: 760, working: ['80%', '2 working · 1 waiting', 'Open board'], pill: /^env-e2e-test needs you · commit blocked$/, done: ['4 done · 0 open', 'Open board'], needsStrip: 'bars' },
  { px: 560, working: ['80%', '2 working · 1 waiting', 'Board'], pill: /^env-e2e-test needs you · commit blocked$/, done: ['4 done · 0 open', 'Board'], needsStrip: 'bars' },
  { px: 390, working: ['80%', 'Board'], pill: /^env-e2e-test needs you$/, done: ['Board'], needsStrip: 'dots' },
  { px: 300, working: ['80%', 'Board'], pill: /^env-e2e-test needs you$/, done: ['Board'], needsStrip: 'none' },
] as const

for (const point of BREAKPOINTS) {
  test(`${point.px} px: lead and button always; counts only when they fit; the pill drops its reason, then the strip goes before the name truncates; dots when bars can't get 24 px`, async ($, on) => {
    await band($, on, WORKING)
    const columns = Math.round((point.px + 16) / COLUMN)
    const parts = async (sessions: BoardSession[], name: string) => {
      await $.tool.call({ tool: BOARD_TOOL, ...publish(sessions) })
      const ui = await mount($, columns)
      await dump(`band-narrow-${point.px}-${name}`, ui)
      const found = { texts: await textsOf(ui), icons: await iconsOf(ui), width: await widthOfStrip(ui), spacers: (await ui.findAll({ type: 'Box' })).filter(box => box.props.flexGrow === 1 && !box.children?.length).length }
      await ui.unmount()
      return found
    }
    const working = await parts(WORKING, 'working')
    expect(working.texts).toEqual([...point.working])
    expect(working.icons).toEqual(point.working.length === 3 ? ['pulse', 'panel'] : ['panel'])
    expect(working.width).toBeGreaterThanOrEqual(4 * 24 + 3 * 4)
    const needs = await parts(NEEDS, 'needs-you')
    expect(needs.texts[0]).toMatch(point.pill)
    expect(needs.texts.slice(1)).toEqual(['Open chat'])
    expect(needs.icons).toEqual(['needs', 'chat'])
    const strip = Number.isNaN(needs.width) ? 'none' : needs.width === dotsWidth(sessionsOf(5)) ? 'dots' : 'bars'
    expect([point.px, strip]).toEqual([point.px, point.needsStrip])
    strip === 'bars' && expect(needs.width).toBeGreaterThanOrEqual(5 * 24 + 4 * 4)
    expect(needs.spacers).toBe(strip === 'none' ? 1 : 0)
    const done = await parts(DONE, 'all-done')
    expect(done.texts).toEqual([...point.done])
    expect(done.icons).toEqual(point.done.length === 2 ? ['check', 'done', 'panel'] : ['check', 'panel'])
    expect(done.width).toBeGreaterThanOrEqual(4 * 24 + 3 * 4)
  })
}

test('more than 8 workers: dots at any width, and the counts still show when they fit', async ($, on) => {
  const many: BoardSession[] = [...Array(10).keys()].map(index => ({ id: `local_${index}`, name: `w${index}`, state: index % 2 ? 'working' : 'waiting', progress: 'step 1 of 2 — x' }))
  await band($, on, many)
  const ui = await mount($)
  await dump('band-dots', ui)
  expect(await widthOfStrip(ui)).toBe(dotsWidth(sessionsOf(10)))
  expect(await textsOf(ui)).toEqual(['50%', '5 working · 5 waiting', 'Open board'])
  await ui.unmount()
  expect(fitBand({ room: 70, gap: 12, items: sessionsOf(3), counts: 150 })).toEqual({ pill: '', showCounts: false, isDots: true, strip: dotsWidth(sessionsOf(3)), isHidden: false })
  expect(fitBand({ room: 400, gap: 12, items: sessionsOf(3), counts: 150 })).toEqual({ pill: '', showCounts: true, isDots: false, strip: 238, isHidden: false })
})

test('terminal: text segments, one per worker, and the same pressable action', async ($, on) => {
  const { opened } = await band($, on, DONE)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await dump('band-terminal', ui)
  const texts = await textsOf(ui)
  expect(texts[0]).toBe('✓')
  expect(texts.slice(1, 5).every(one => /^█+░*$/.test(one))).toBe(true)
  expect(texts.slice(5)).toEqual(['4 done · 0 open'])
  expect(await buttonsOf(ui)).toEqual([['band-board', 'Open board']])
  await ui.press({ key: 'band-board' })
  expect(opened).toEqual(['master-session'])
  await ui.unmount()
})

test('without a Client: one native Button per face, each press runs its action', async ($, on) => {
  const pressed: string[] = []
  const current = boardOf(NEEDS)
  on('ui.render', { component: 'Pane', requestId: PROBE }, ($, event) => {
    const progress = bandProgress(current, liveOf())
    if (!progress) throw new Error('no band')
    const table = $.ui.resolve(event)
    const { Box, Button, Text } = table
    const view = bandViewOf(event.props.bodyColumns, current, progress, '', false, IDLE, {
      board: () => pressed.push('board'),
      chat: (id, name) => pressed.push(`chat ${id} ${name}`),
    })
    return event.surface !== 'terminal' && 'Svg' in table ? Band({ Box, Text, Button, Svg: guardSvg(table.Svg, Text) }, { view, progress }) : TextBand({ Box, Text, Button }, { view, progress, columns: event.props.bodyColumns })
  })
  const ui = await $.ui.mount({ plugin: 'master-session', component: 'Pane', requestId: PROBE, surface: 'vscode', props: { title: 'band', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 6 }, view: {} } })
  await dump('band-no-client', ui)
  expect(await ui.findAll({ type: 'Client' })).toEqual([])
  expect(await buttonsOf(ui)).toEqual([['band-chat', 'Open chat']])
  await ui.press({ key: 'band-chat', plugin: 'test' })
  expect(pressed).toEqual(['chat local_e env-e2e-test'])
  await ui.unmount()
})

test('working counts add running subagents and workflows in text semibold; each part hides at 0; a run adds one piece per phase, its agents none', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, WORKING)
  const none = await countsOf($)
  expect(none.texts).toEqual(['80%', '2 working · 1 waiting', 'Open board'])
  expect(none.extras).toEqual([])
  await crew.subagent('docs')
  const one = await countsOf($)
  expect(one.extras).toEqual(['1 subagent'])
  expect(one.alt).toBe('Master session: 80 percent, 2 working, 1 waiting, 1 subagent')
  await crew.subagent('review')
  await crew.workflow(3)
  const both = await countsOf($)
  expect(both.extras).toEqual(['2 subagents · 1 workflow'])
  expect(both.alt).toBe('Master session: 80 percent, 2 working, 1 waiting, 2 subagents, 1 workflow')
  expect(both.segments).toBe(5)
  await crew.finish('docs')
  await crew.finish('review')
  expect((await countsOf($)).extras).toEqual(['1 workflow'])
  await crew.workflow(1)
  expect((await countsOf($)).extras).toEqual(['2 workflows'])
  for (const index of [0, 1, 2]) await crew.finish(`wf_1-${index}`)
  await crew.finish('wf_2-0')
  const after = await countsOf($)
  expect(after.extras).toEqual([])
  expect(after.texts).toEqual(none.texts)
})

test('needs you and all done show no subagent or workflow counts', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, NEEDS)
  await crew.subagent('docs')
  await crew.workflow(1)
  expect((await countsOf($)).extras).toEqual([])
  await $.tool.call({ tool: BOARD_TOOL, ...publish(DONE) })
  const done = await countsOf($)
  expect(done.texts).toEqual(['4 done · 0 open', 'Open board'])
  expect(done.extras).toEqual([])
})

test('narrowing drops the subagent and workflow part first, then the counts, never the other way round', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, WORKING)
  await crew.subagent('docs')
  await crew.workflow(1)
  const seen: string[] = []
  for (let columns = 110; columns >= 40; columns -= 2) {
    const { texts, extras } = await countsOf($, columns)
    const step = extras.length ? 'all' : texts.some(text => text.startsWith('2 working')) ? 'counts' : 'none'
    seen.at(-1) !== step && seen.push(step)
  }
  expect(seen).toEqual(['all', 'counts', 'none'])
})

test('extrasOf names each part with its plural and drops zeros; agentCountsOf hands the agents and workflows to the band as they are', () => {
  const agent = { id: 'a', type: 'general-purpose', description: 'a', state: 'running' as const, startedAt: 0 }
  expect(agentCountsOf([], [])).toEqual(IDLE)
  expect(agentCountsOf([agent], [])).toEqual({ agents: [agent], workflows: [] })
  expect(extrasOf({ subagents: 0, workflows: 0 })).toEqual([])
  expect(extrasOf({ subagents: 1, workflows: 0 })).toEqual(['1 subagent'])
  expect(extrasOf({ subagents: 0, workflows: 1 })).toEqual(['1 workflow'])
  expect(extrasOf({ subagents: 3, workflows: 2 })).toEqual(['3 subagents', '2 workflows'])
})

test('v2-11 geometry: bar 56 with gap 12, percent 34, pill 34 with 0 12 0 8, button 32 with 0 12 0 8 and gap 4, icons 15, 16 and 18', async ($, on) => {
  await band($, on, NEEDS)
  const boxes = async (ui: Found) => (await ui.findAll({ type: 'Box' })).map(one => one.props)
  const sizes = async (ui: Found) => (await ui.findAll({ type: 'Svg' })).filter(one => one.props.isInteractive !== true && !isFace(one)).map(one => [one.props.alt, one.props.width])
  const faceOf = async (ui: Found, _name: string) => String((await ui.findAll({ type: 'Svg' })).find(one => isFace(one) && !isHot(one))?.props.source)
  for (const [px, padLeft, padRight] of [[760, 8, 8], [390, 8, 6]] as const) {
    const ui = await mount($, Math.round((px + 16) / COLUMN))
    const [bar, pill] = await boxes(ui)
    expect(bar).toEqual(expect.objectContaining({ height: tall(56), gap: across(12), paddingLeft: across(padLeft), paddingRight: across(padRight), borderStyle: 'round' }))
    expect(pill).toEqual(expect.objectContaining({ height: tall(34), gap: across(6), paddingLeft: across(8), paddingRight: across(12), borderStyle: 'round', borderColor: 'error' }))
    expect((await ui.find({ key: 'face-band-chat' }))?.props).toEqual(expect.objectContaining({ height: tall(32) }))
    px < 600 && expect((await ui.find({ key: 'face-band-chat' }))?.props.width).toBe(across(32))
    expect(await sizes(ui)).toEqual([['needs', 15]])
    const chat = await faceOf(ui, 'chat')
    expect(chat).toMatch(/--accentBtn:#B85335.*--onAccent:#FFFFFF.*prefers-color-scheme: dark.*fill:var\(--accentBtn\)/)
    expect(chat).toContain('stroke:var(--onAccent)')
    expect(chat).toContain(`scale(${16 / 24})`)
    expect(chat.includes('Open chat')).toBe(px >= 600)
    await ui.unmount()
  }
  for (const [sessions, padLeft, padRight, px] of [[WORKING, 16, 8, 760], [WORKING, 12, 6, 390], [DONE, 16, 8, 760], [DONE, 12, 6, 390]] as const) {
    await $.tool.call({ tool: BOARD_TOOL, ...publish([...sessions]) })
    const ui = await mount($, Math.round((px + 16) / COLUMN))
    const [bar] = await boxes(ui)
    expect(bar).toEqual(expect.objectContaining({ height: tall(56), gap: across(12), paddingLeft: across(padLeft), paddingRight: across(padRight) }))
    expect((await ui.find({ key: 'face-band-board' }))?.props).toEqual(expect.objectContaining({ height: tall(32) }))
    const board = await faceOf(ui, 'board')
    expect(board).toMatch(/fill:var\(--accentTint\).*stroke:var\(--accentText\).*fill:var\(--accentText\)/)
    expect(board).toContain(`scale(${16 / 24})`)
    const icons = Object.fromEntries(await sizes(ui))
    sessions === DONE && expect(icons.check).toBe(18)
    px === 760 && expect(icons[sessions === DONE ? 'done' : 'pulse']).toBe(15)
    await ui.unmount()
  }
})

test('terminal: the subagent and workflow part follows the counts in semibold', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, WORKING)
  await crew.subagent('docs')
  await crew.workflow(2)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await dump('band-terminal-extras', ui)
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.map(one => one.text).slice(-2)).toEqual(['2 working · 1 waiting', '· 1 subagent · 1 workflow'])
  expect(texts.at(-1)?.props.weight).toBe('semibold')
  expect(await buttonsOf(ui)).toEqual([['band-board', 'Open board']])
  await ui.unmount()
})

const CREW = (asking: { own?: boolean; remote?: boolean; flow?: boolean } = {}) => {
  const ask = { text: 'Allow Bash: rm -rf dist', since: 1 }
  return {
    agents: [
      { id: 'o1', name: 'QA verifier', type: 'master-session:qa-verifier', description: 'Verify the sha', state: 'running' as const, startedAt: 1 },
      { id: 'o2', name: 'Reviewer', type: 'master-session:reviewer', description: 'Review the diff', state: 'running' as const, startedAt: 2, parentAgentId: 'o1', ...(asking.own ? { asking: ask } : {}) },
      { id: 'r1', name: 'QA verifier', type: 'master-session:qa-verifier', description: 'Verify', state: 'running' as const, startedAt: 3, parentSessionId: 'local_b' },
      { id: 'r2', name: 'Reviewer', type: 'master-session:reviewer', description: 'Review', state: 'running' as const, startedAt: 4, parentSessionId: 'local_b', parentAgentId: 'r1', ...(asking.remote ? { asking: ask } : {}) },
      { id: 'x0', type: 'workflow-subagent', description: 'remote scan', state: 'running' as const, startedAt: 5, parentSessionId: 'local_c', run: { id: 'wf_9', index: 0 } },
      { id: 'w0', type: 'workflow-subagent', description: 'scan 0', state: 'done' as const, startedAt: 6, endedAt: 7, run: { id: 'wf_1', index: 0 } },
      { id: 'w1', type: 'workflow-subagent', description: 'scan 1', state: 'running' as const, startedAt: 8, run: { id: 'wf_1', index: 1 }, ...(asking.flow ? { asking: { ...ask, text: 'Allow Edit: a.ts' } } : {}) },
    ],
    workflows: [{ id: 'wf_1', toolUseId: 't1', name: 'review-changes', phases: ['Scan', 'Check'], startedAt: 6 }],
  }
}

const viewOf = (sessions: BoardSession[], crew: AgentCounts, columns = 100) => {
  const current = boardOf(sessions)
  const progress = bandProgress(current, liveOf([], sessions))
  if (!progress) throw new Error('no band')
  const chats: string[] = []
  const view = bandViewOf(columns, current, progress, '', false, crew, { board: () => chats.push('board'), chat: (id, name) => chats.push(`${id} ${name}`) })
  return { view, chats }
}

test('lane 7 order: this chat’s own subagents first, then each session followed by its own subagents nested under their parent and its runs, then this chat’s runs', () => {
  const { view } = viewOf(WORKING, CREW(), 160)
  expect(view.items.map(one => [one.id, one.kind, !!one.isChild])).toEqual([
    ['o1', 'subagent', true],
    ['o2', 'subagent', true],
    ['local_a', 'session', false],
    ['local_b', 'session', false],
    ['r1', 'subagent', true],
    ['r2', 'subagent', true],
    ['local_c', 'session', false],
    ['wf_9', 'workflow', false],
    ['local_d', 'session', false],
    ['wf_1', 'workflow', false],
  ])
  expect(view.items.find(one => one.id === 'wf_1')).toEqual(expect.objectContaining({ pieces: 2, fill: 0.5, tone: 'green' }))
  expect(view.extras).toBe('4 subagents · 2 workflows')
})

test('the needs-you pill names any kind: a session, a worker’s subagent with its parent and Open chat to that worker, this chat’s subagent or workflow agent with no Open chat', () => {
  const remote = viewOf(WORKING.map(one => (one.id === 'local_b' ? { ...one, state: 'needs-you' as const, needsYou: 'Allow Bash: rm -rf dist' } : one)), CREW({ remote: true }))
  expect([remote.view.pillText, remote.view.alt]).toEqual(['Reviewer, in QA verifier, needs you · Allow Bash: rm -rf dist', 'Master session: Reviewer, in QA verifier, needs you, Allow Bash: rm -rf dist'])
  expect(remote.view.action?.label).toBe('Open chat')
  remote.view.action?.press()
  expect(remote.chats).toEqual(['local_b mod-ui'])
  expect(viewOf(WORKING.map(one => (one.id === 'local_b' ? { ...one, state: 'needs-you' as const, needsYou: 'Allow Bash: rm -rf dist' } : one)), CREW({ remote: true }), 66).view.pillText).toBe('Reviewer needs you')
  const own = viewOf(WORKING, CREW({ own: true }))
  expect([own.view.pillText, own.view.action]).toEqual(['Reviewer, in QA verifier, needs you · Allow Bash: rm -rf dist', undefined])
  const flow = viewOf(WORKING, CREW({ flow: true }))
  expect([flow.view.pillText, flow.view.action]).toEqual(['scan 1, in review-changes, needs you · Allow Edit: a.ts', undefined])
  expect(flow.view.items.find(one => one.id === 'wf_1')?.tone).toBe('red')
  const session = viewOf(NEEDS, CREW())
  expect([session.view.pillText, session.view.action?.label]).toEqual(['env-e2e-test needs you · commit blocked', 'Open chat'])
})

test('the needs-you pill: C.text words on the red tint, red border and glyph', async ($, on) => {
  await band($, on, NEEDS)
  const ui = await mount($)
  const pill = (await ui.findAll({ type: 'Box' }))[1]
  expect(pill?.props).toEqual(expect.objectContaining({ borderColor: 'error', backgroundColor: 'rgba(211,119,114,0.139)' }))
  const words = (await ui.findAll({ type: 'Text' })).find(one => one.text.includes('needs you'))
  expect(words?.props.color).toBe('text')
  expect(String((await ui.findAll({ type: 'Svg' }))[0]?.props.source)).toContain('var(--red)')
  await ui.unmount()
})

test('with no worker sessions, running subagents still show the band: their segments, the subagent count alone, and Open board', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, [], false, [])
  const agent = { id: 'a', type: 'general-purpose', description: 'a', startedAt: 0 }
  expect(bandProgressWith(boardOf([]), liveOf([], []), IDLE, true)).toBeUndefined()
  expect(bandProgressWith(boardOf([]), liveOf([], []), { agents: [{ ...agent, state: 'done' }], workflows: [] }, true)).toBeUndefined()
  expect(bandProgressWith(boardOf([]), liveOf([], []), { agents: [{ ...agent, state: 'running' }], workflows: [] }, true)?.total).toBe(0)
  expect(bandProgressWith(boardOf([]), liveOf([], []), { agents: [{ ...agent, state: 'running' }], workflows: [] }, false)).toBeUndefined()
  expect(bandProgressWith(boardOf(WORKING), liveOf([], WORKING), IDLE, false)?.total).toBe(4)
  await crew.subagent('docs')
  await crew.subagent('review')
  const ui = await mount($)
  const source = String((await stripOf(ui))?.props.source)
  expect(pathOf(source, 'green').split('M').filter(one => one.includes(',2h')).length).toBe(2)
  expect(pathOf(source, 'track')).toBe('')
  expect(await textsOf(ui)).toEqual(['2 subagents', 'Open board'])
  expect((await stripOf(ui))?.props.alt).toBe('Master session: 2 subagents')
  await ui.unmount()
  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const lines = (await terminal.findAll({ type: 'Text' })).map(one => one.text)
  expect(lines.some(one => /%/.test(one))).toBe(false)
  expect(lines[0]).toBe('•')
  expect(lines).toContain('2 subagents')
  await terminal.unmount()
})

test("a worker's run keeps its phases from the worker's report: one piece per phase, drawn before its first agent", () => {
  const crew = CREW()
  const workflows: WorkflowRecord[] = [...crew.workflows, { id: 'wf_9', toolUseId: '', name: 'remote-review', phases: ['A', 'B', 'C'], startedAt: 5, parentSessionId: 'local_c' }, { id: 'wf_8', toolUseId: '', phases: ['X', 'Y'], startedAt: 6, parentSessionId: 'local_a' }]
  const { view } = viewOf(WORKING, { ...crew, workflows })
  expect(view.items.find(one => one.id === 'wf_9')).toEqual(expect.objectContaining({ pieces: 3, tone: 'green' }))
  expect(view.items.find(one => one.id === 'wf_8')).toEqual(expect.objectContaining({ pieces: 2, tone: 'green', isRunning: true }))
  expect(view.items.filter(one => one.kind === 'workflow').map(one => one.id)).toEqual(['wf_8', 'wf_9', 'wf_1'])
})

test('a run with many phases never gets a piece under 4 px: it takes its own least width and the rest share what is left', () => {
  const items = [S('green', 0.5), W('green', 0.5, 13), S('amber', 0.5)]
  expect(barsWidth(items)).toBe(24 + (13 * 4 + 2 * 12) + 24 + 2 * 4)
  const source = strip(barsWidth(items), items)
  const widths = [...pathOf(source, 'track').matchAll(/M[\d.]+,0h(-?[\d.]+)a([\d.]+),/g)].map(match => Number(match[1]) + 2 * Number(match[2]))
  expect(widths.length).toBeGreaterThanOrEqual(13)
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(4)
})

test('a plain session that runs a subagent, with no board of its own and no workers, gets no band', async ($, on) => {
  const crew = crewOf($, on)
  const register = on as unknown as (event: string, ...rest: unknown[]) => unknown
  const scoped = (event: string, ...rest: unknown[]) => {
    if (event !== 'mcp.call') return register(event, ...rest)
    const inner = rest[0] as McpHook
    return register(event, (context: unknown, call: { tool: string }) => (call.tool === 'list_sessions' ? text([]) : inner(context, call)))
  }
  on('ui.render', { component: 'AbovePrompt' }, ($, event) => {
    const { Text } = $.ui.resolve(event)
    return <Text>no band</Text>
  })
  const { clock } = world(scoped as unknown as On)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  await crew.subagent('docs')
  const ui = await mount($)
  expect(await textsOf(ui)).toEqual(['no band'])
  await ui.unmount()
})

test('with the strip hidden, the short pill gets the whole room: it fits whole at room = pill chrome + text and truncates only below', () => {
  const short = 'env-e2e-test needs you'
  const exact = 2 + 8 + 15 + 6 + 12 + widthOf(short)
  const input = { gap: 12, items: sessionsOf(5), counts: 0, full: `${short} · commit blocked`, short }
  expect(fitBand({ ...input, room: exact })).toEqual({ pill: short, showCounts: false, isDots: true, strip: 0, isHidden: true })
  expect(fitBand({ ...input, room: exact - 1 }).pill).toMatch(/…$/)
})
