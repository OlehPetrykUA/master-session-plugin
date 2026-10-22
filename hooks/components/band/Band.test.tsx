import { expect, test } from 'claude-code/testing'
import type { Engine, FoundElement } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Board, BoardSession, Live } from '../../../types'

import { agentCountsOf, bandAction, bandProgress, bandViewOf, extrasOf, fitBand, slotWidth } from '../../lib/band'
import { CH, COLUMN, across, tall } from '../../lib/layout'
import { freshReport, merge } from '../../data/contract'
import { progressOf } from '../../lib/board'
import { rowsOf } from '../../lib/rows'
import { BAND, BOARD_TOOL, PANE, SELF, SPAWN, click, dump, started, text } from '../../testing/world'
import { PERCENT } from '../../theme/band'
import { I } from '../../theme/icons'
import { dotsWidth, strip } from '../../theme/strip'
import type { Segment } from '../../theme/strip'
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

const IDLE = { subagents: 0, workflows: 0 }

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
    texts: texts.map(one => one.text.replace(/[  ]/g, '').trim()),
    extras: texts.filter(one => one.props.weight === 'semibold' && one.props.color === 'text').map(one => one.text),
    alt: strip?.props.alt,
    segments: pills(pathOf(String(strip?.props.source), 'track')),
  }
  await ui.unmount()
  return found
}

type Found = { findAll: (query: { type?: string }) => Promise<FoundElement[]>; find: (query: { key?: string }) => Promise<FoundElement | undefined> }

const textsOf = async (ui: Found) => (await ui.findAll({ type: 'Text' })).map(one => one.text.replace(/[\u2007\u2009]/g, '').trim())

const buttonsOf = async (ui: Found) => (await ui.findAll({ type: 'Button' })).map(one => [one.key, String(one.props.label)])

const hitsOf = async (ui: Found) => (await ui.findAll({ type: 'Client' })).map(one => [one.key, one.props.module, one.props.props])

const stripOf = async (ui: Found) => (await ui.findAll({ type: 'Svg' })).find(one => one.props.isInteractive === true)

const widthOfStrip = async (ui: Found) => Number(String((await stripOf(ui))?.props.source).match(/viewBox="0 0 ([\d.]+) 10"/)?.[1])

const iconsOf = async (ui: Found) => (await ui.findAll({ type: 'Svg' })).filter(one => one.props.isInteractive !== true).map(one => ICON[String(one.props.source).match(/<path d="([^"]+)"/)?.[1] ?? ''] ?? '?')

const scopesOf = async (ui: Found) => (await ui.findAll({ type: 'Box' })).flatMap(one => (one.key ? [one.key] : []))

const pathOf = (source: string, tone: string) => source.match(new RegExp(`<path(?: class="s")? d="([^"]*)" style="fill:var\\(--${tone}\\)"/>`))?.[1] ?? ''

const pills = (path: string) => path.split('M').filter(Boolean).length

function design(width: number, segments: { tone: string; share: number }[]) {
  const pill = (start: number, size: number) => {
    const length = Math.max(size, 8)
    return 'M' + (start + 4).toFixed(1) + ',1h' + (length - 8).toFixed(1) + 'a4,4 0 0 1 0,8h' + (8 - length).toFixed(1) + 'a4,4 0 0 1 0,-8Z'
  }
  const slot = (width - 4 * (segments.length - 1)) / segments.length
  const paths: Record<string, string> = { track: '', grey: '', amber: '', green: '', red: '' }
  segments.forEach((segment, index) => {
    const start = index * (slot + 4)
    paths.track += pill(start, slot)
    paths[segment.tone] += pill(start, slot * segment.share)
  })
  return paths
}

test('the strip draws the design geometry: one rounded track and one solid fill per worker, dots when narrow', () => {
  const working: Segment[] = [
    { state: 'waiting', fill: 0.8 },
    { state: 'working', fill: 0.6 },
    { state: 'working', fill: 0.8 },
    { state: 'done', fill: 1 },
  ]
  const tones = { waiting: 'amber', working: 'green', done: 'grey', 'needs-you': 'red' } as const
  const needs: Segment[] = [{ state: 'needs-you', fill: 0.5 }, ...working]
  for (const [width, segments] of [
    [340, working],
    [210, working],
    [280, needs],
    [56, needs],
  ] as const) {
    const want = design(width, segments.map(one => ({ tone: tones[one.state], share: one.fill })))
    const source = strip(width, segments)
    for (const tone of ['track', 'grey', 'amber', 'green', 'red']) expect(pathOf(source, tone)).toBe(want[tone])
    expect(pills(pathOf(source, 'track'))).toBe(segments.length)
  }
  expect(dotsWidth(5)).toBe(56)
  expect(strip(56, needs)).toContain('M4.0,1h0.0a4,4 0 0 1 0,8h0.0a4,4 0 0 1 0,-8Z')
  const finished: Segment[] = working.map(one => ({ state: 'done', fill: 1 }))
  expect(pathOf(strip(340, finished, 'done'), 'green')).toBe(design(340, finished.map(() => ({ tone: 'green', share: 1 }))).green)
  expect(pathOf(strip(340, finished, 'done'), 'grey')).toBe('')
  expect(pills(pathOf(strip(400, Array.from({ length: 7 }, () => ({ state: 'waiting' as const, fill: 0 }))), 'track'))).toBe(7)
})

test('the strip animates only a sweep inside working fills and a red pulse, and stops under reduced motion', () => {
  const calm = strip(340, [{ state: 'waiting', fill: 0.5 }, { state: 'done', fill: 1 }])
  expect(calm).not.toContain('<animate')
  const busy = strip(340, [{ state: 'working', fill: 0.6 }, { state: 'working', fill: 0.8 }, { state: 'waiting', fill: 0.8 }])
  expect(busy.match(/<animateTransform attributeName="transform" type="translate"/g)).toHaveLength(2)
  expect(busy.match(/dur="2.4s"/g)).toHaveLength(2)
  expect(busy).toContain('clip-path="url(#f0)"')
  expect(busy).not.toContain('<animate ')
  expect(busy).not.toContain('<rect')
  expect(busy).toContain('@media (prefers-reduced-motion: reduce){.m{display:none}.s{display:inline}}')
  const asking = strip(280, [{ state: 'needs-you', fill: 0.5 }, { state: 'working', fill: 0.6 }], 'dim')
  expect(asking).toContain('<g opacity=".35">')
  expect(asking).toContain('<animate attributeName="opacity" values="1;.4;1" dur="2.4s"')
  expect(asking).not.toContain('animateTransform')
  expect(strip(2000, Array.from({ length: 40 }, () => ({ state: 'working' as const, fill: 0.7 }))).length).toBeLessThan(131_072)
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
  expect((await stripOf(dots))?.props.width).toBe(dotsWidth(10))
  const growing = (await dots.findAll({ type: 'Box' })).filter(box => box.props.flexGrow === 1 && box.props.width === undefined)
  expect(growing.map(box => box.props.flexShrink)).toEqual([0])
  expect(JSON.stringify(growing[0]?.children)).toContain('10 working')
  await dots.unmount()
})

test('every icon is drawn with its name as alt, the counts icon included', async ($, on) => {
  await band($, on, WORKING)
  const work = await mount($)
  const icons = (await work.findAll({ type: 'Svg' })).filter(one => one.props.isInteractive !== true)
  expect(icons.map(one => one.props.alt)).toEqual(['pulse', 'panel'])
  expect(await iconsOf(work)).toEqual(['pulse', 'panel'])
  await work.unmount()
  await $.tool.call({ tool: BOARD_TOOL, ...publish(DONE) })
  const done = await mount($)
  expect((await done.findAll({ type: 'Svg' })).filter(one => one.props.isInteractive !== true).map(one => one.props.alt)).toEqual(['check', 'done', 'panel'])
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
  expect(percent?.props).toEqual(expect.objectContaining({ weight: 'bold', size: 'heading', tabular: true }))
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
  { px: 760, working: ['80%', '2 working · 1 waiting', 'Open board'], pill: /^env-e2e-test needs you · commit blocked$/, done: ['4 done · 0 open', 'Open board'], needsDots: false },
  { px: 560, working: ['80%', '2 working · 1 waiting', 'Board'], pill: /^env-e2e-test needs you$/, done: ['4 done · 0 open', 'Board'], needsDots: false },
  { px: 390, working: ['80%', 'Board'], pill: /^env-e2e-test needs …$/, done: ['Board'], needsDots: true },
  { px: 300, working: ['80%', 'Board'], pill: /^env-e2[^ ]*…$/, done: ['Board'], needsDots: true },
] as const

for (const point of BREAKPOINTS) {
  test(`${point.px} px: lead and button always; counts only when they fit; the pill drops its reason, then truncates at its end; dots when bars can't get 24 px`, async ($, on) => {
    await band($, on, WORKING)
    const columns = Math.round((point.px + 16) / COLUMN)
    const parts = async (sessions: BoardSession[], name: string) => {
      await $.tool.call({ tool: BOARD_TOOL, ...publish(sessions) })
      const ui = await mount($, columns)
      await dump(`band-narrow-${point.px}-${name}`, ui)
      const found = { texts: await textsOf(ui), icons: await iconsOf(ui), width: await widthOfStrip(ui) }
      await ui.unmount()
      return found
    }
    const working = await parts(WORKING, 'working')
    expect(working.texts).toEqual([...point.working])
    expect(working.icons).toEqual(point.working.length === 3 ? ['pulse', 'panel'] : ['panel'])
    expect(working.width).toBeGreaterThanOrEqual(4 * 24 + 3 * 4)
    const needs = await parts(NEEDS, 'needs-you')
    expect(needs.texts).toHaveLength(2)
    expect(needs.texts[0]).toMatch(point.pill)
    expect(needs.texts[1]).toBe('Open chat')
    expect(needs.icons).toEqual(['needs', 'chat'])
    expect(needs.width === dotsWidth(5)).toBe(point.needsDots)
    expect(needs.width).toBeGreaterThanOrEqual(point.needsDots ? dotsWidth(5) : 5 * 24 + 4 * 4)
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
  expect(await widthOfStrip(ui)).toBe(dotsWidth(10))
  expect(await textsOf(ui)).toEqual(['50%', '5 working · 5 waiting', 'Open board'])
  await ui.unmount()
  expect(fitBand({ room: 70, gap: 12, count: 3, counts: 150 })).toEqual({ pill: '', showCounts: false, isDots: true, strip: dotsWidth(3) })
  expect(fitBand({ room: 400, gap: 12, count: 3, counts: 150 })).toEqual({ pill: '', showCounts: true, isDots: false, strip: 238 })
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

test('working counts add running subagents and workflows in text semibold; each part hides at 0; workflow agents add no segment', async ($, on) => {
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
  expect(both.segments).toBe(4)
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

test('agentCountsOf counts running subagents and running workflow runs; extrasOf names each with its plural and drops zeros', () => {
  const agent = (id: string, state: 'running' | 'done' | 'failed', run?: string) => ({ id, type: 'general-purpose', description: id, state, startedAt: 0, run: run ? { id: run, index: 0 } : undefined })
  const workflow = (id: string) => ({ id, toolUseId: id, startedAt: 0 })
  expect(agentCountsOf([], [])).toEqual(IDLE)
  expect(agentCountsOf([agent('a', 'running'), agent('b', 'done'), agent('c', 'failed'), agent('w', 'running', 'wf_1'), agent('x', 'done', 'wf_2')], [workflow('wf_1'), workflow('wf_2'), workflow('wf_3')])).toEqual({ subagents: 1, workflows: 2 })
  expect(extrasOf(IDLE)).toEqual([])
  expect(extrasOf({ subagents: 1, workflows: 0 })).toEqual(['1 subagent'])
  expect(extrasOf({ subagents: 0, workflows: 1 })).toEqual(['1 workflow'])
  expect(extrasOf({ subagents: 3, workflows: 2 })).toEqual(['3 subagents', '2 workflows'])
})

test('v2-11 geometry: bar 56 with gap 12, percent 34, pill 34 with 0 12 0 8, button 32 with 0 12 0 8 and gap 4, icons 15, 16 and 18', async ($, on) => {
  await band($, on, NEEDS)
  const boxes = async (ui: Found) => (await ui.findAll({ type: 'Box' })).map(one => one.props)
  const sizes = async (ui: Found) => (await ui.findAll({ type: 'Svg' })).filter(one => one.props.isInteractive !== true).map(one => [one.props.alt, one.props.width])
  for (const [px, padLeft, padRight] of [[760, 10, 8], [390, 8, 6]] as const) {
    const ui = await mount($, Math.round((px + 16) / COLUMN))
    const [bar, pill] = await boxes(ui)
    expect(bar).toEqual(expect.objectContaining({ height: tall(56), gap: across(12), paddingLeft: across(padLeft), paddingRight: across(padRight), borderStyle: 'round' }))
    expect(pill).toEqual(expect.objectContaining({ height: tall(34), gap: across(6), paddingLeft: across(8), paddingRight: across(12), borderStyle: 'round', borderColor: 'error' }))
    expect((await ui.find({ key: 'face-band-chat' }))?.props).toEqual(expect.objectContaining({ height: tall(32), gap: across(4), borderStyle: 'round' }))
    expect(await sizes(ui)).toEqual([['needs', 15], ['chat', 16]])
    await ui.unmount()
  }
  for (const [sessions, padLeft, padRight, px] of [[WORKING, 16, 8, 760], [WORKING, 12, 6, 390], [DONE, 16, 8, 760], [DONE, 12, 6, 390]] as const) {
    await $.tool.call({ tool: BOARD_TOOL, ...publish([...sessions]) })
    const ui = await mount($, Math.round((px + 16) / COLUMN))
    const [bar] = await boxes(ui)
    expect(bar).toEqual(expect.objectContaining({ height: tall(56), gap: across(12), paddingLeft: across(padLeft), paddingRight: across(padRight) }))
    expect((await ui.find({ key: 'face-band-board' }))?.props).toEqual(expect.objectContaining({ height: tall(32), gap: across(4) }))
    const icons = Object.fromEntries(await sizes(ui))
    expect(icons.panel).toBe(16)
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
