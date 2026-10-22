import { expect, test } from 'claude-code/testing'
import type { Engine, FoundElement } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Board, BoardSession, Live } from '../../../types'

import { bandAction, bandProgress, bandViewOf, fitBand, slotWidth } from '../../lib/band'
import { CH, COLUMN, across } from '../../lib/layout'
import { BAND, BOARD_TOOL, SELF, click, dump, started } from '../../testing/world'
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

const liveOf = (archived: string[] = []): Live => ({
  self: SELF,
  title: '',
  error: '',
  at: 0,
  sessions: NEEDS.map(one => ({ id: one.id, name: one.name, title: '', cwd: '/', isRunning: true, isArchived: archived.includes(one.id), lastActivityAt: 0, startedBy: SELF })),
})

async function band($: Engine, on: On, sessions: BoardSession[], isPaneOpen = false) {
  let isOpen = isPaneOpen
  on('ui.panes', () => ({ value: isOpen ? [{ id: 'master-session', title: 'Master session', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  const register = on as unknown as (event: string, ...rest: unknown[]) => unknown
  const run = await started($, ((event: string, ...rest: unknown[]) => (event === 'ui.panes' ? undefined : register(event, ...rest))) as unknown as On, publish(sessions))
  return { ...run, open: (value: boolean) => (isOpen = value) }
}

const mount = ($: Engine, bodyColumns = 100) => $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns } })

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

test('no band without a board, with no workers, or with every worker archived; archived ones drop out in board order', () => {
  expect(bandProgress(null, liveOf())).toBeUndefined()
  expect(bandProgress(boardOf([]), liveOf())).toBeUndefined()
  expect(bandProgress(boardOf(WORKING), liveOf(WORKING.map(one => one.id)))).toBeUndefined()
  expect(bandProgress(boardOf(NEEDS), liveOf(['local_b']))?.segments.map(one => one.id)).toEqual(['local_e', 'local_a', 'local_c', 'local_d'])
  expect(bandProgress(boardOf(WORKING), liveOf())?.segments.map(one => one.fill)).toEqual([0.8, 0.6, 0.8, 1])
})

test('band presses route by Client key: band-hit-board, -chat, -summary; the pane’s hit- keys are not the band’s', () => {
  expect(bandAction('band-hit-board')).toBe('board')
  expect(bandAction('band-hit-chat')).toBe('chat')
  expect(bandAction('band-hit-summary')).toBe('summary')
  expect(bandAction('band-hit-other')).toBeUndefined()
  expect(bandAction('hit-tile-local_a')).toBeUndefined()
})

test('the strip stretches by flex: bars fill the box that takes the leftover width, dots keep their width with a spacer after the counts', async ($, on) => {
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
  expect((await dots.findAll({ type: 'Box' })).filter(box => box.props.flexGrow === 1 && box.props.width === undefined)).toHaveLength(1)
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
  expect((await before.findAll({ type: 'Box' })).some(box => box.props.width === across(40) && JSON.stringify(box.children).includes('80%'))).toBe(true)
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

test('all done: check, full green fills, counts, and Summary with the board icon, hidden while the pane is open', async ($, on) => {
  const run = await band($, on, DONE)
  const ui = await mount($)
  await dump('band-all-done', ui)
  const strip = await stripOf(ui)
  expect(strip?.props.alt).toBe('Master session: all 4 done')
  expect(pills(pathOf(String(strip?.props.source), 'green'))).toBe(4)
  expect(pathOf(String(strip?.props.source), 'grey')).toBe('')
  expect(String(strip?.props.source)).not.toContain('<animate')
  expect(await textsOf(ui)).toEqual(['4 done · 0 open', 'Summary'])
  expect(await iconsOf(ui)).toEqual(['check', 'done', 'panel'])
  expect((await hitsOf(ui)).map(one => one[0])).toEqual(['band-hit-summary'])
  run.open(true)
  await click(ui, 'band-hit-summary', 2, 1)
  await run.clock.settle()
  expect(run.opened).toEqual(['master-session'])
  expect(await textsOf(ui)).toEqual(['4 done · 0 open'])
  await ui.unmount()
})

const BREAKPOINTS = [
  { px: 760, working: ['80%', '2 working · 1 waiting', 'Open board'], pill: /^env-e2e-test needs you · commit blocked$/, done: ['4 done · 0 open', 'Summary'], needsDots: false },
  { px: 560, working: ['80%', '2 working · 1 waiting', 'Board'], pill: /^env-e2e-test needs you$/, done: ['4 done · 0 open', 'Summary'], needsDots: false },
  { px: 390, working: ['80%', 'Board'], pill: /^env-e2e-test needs you$/, done: ['Summary'], needsDots: true },
  { px: 300, working: ['80%', 'Board'], pill: /^env-e2e[^ ]*…$/, done: ['Summary'], needsDots: true },
] as const

for (const point of BREAKPOINTS) {
  test(`${point.px} px: lead and button always; counts only when they fit; the pill drops its reason, then shortens the name; dots when bars can't get 24 px`, async ($, on) => {
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
  expect(await buttonsOf(ui)).toEqual([['band-summary', 'Summary']])
  await ui.press({ key: 'band-summary' })
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
    const view = bandViewOf(event.props.bodyColumns, current, progress, '', false, {
      board: () => pressed.push('board'),
      summary: () => pressed.push('summary'),
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
