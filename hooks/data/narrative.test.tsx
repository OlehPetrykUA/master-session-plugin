import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { boardFromJson } from '../lib/board'
import { BOARD_SCHEMA, FILE_MS, LIVE_MS, SECTIONS, TICK_MS } from '../lib/constants'
import { rowsOf } from '../lib/list'
import { across, bodyWidthOf, down } from '../lib/layout'
import { C } from '../theme/tokens'
import { BAND, BOARD, BOARD_TOOL, HOME, MASTER, PANE, SELF, altsOf, childOf, click, started, textsOf, warmUp, world } from '../testing/world'
import type { Ui } from '../testing/world'
import { REPORTS_TOOL } from './contract'

warmUp()

const BOARD_FILE = `${HOME}/.claude/state/master-session/boards/${SELF}.json`

const N = 'Three workers are on the band fix. pane-header is in review and idle-states is running its tests. Next: merge pane-header once QA and review pass. Needs you: approve the push for skill-roles.'

const LONG = Array.from({ length: 100 }, (_, index) => `w${String(index).padStart(2, '0')}x`).join(' ').slice(0, 500)

const call = ($: Engine, patch: Record<string, unknown> = {}) => $.tool.call({ tool: BOARD_TOOL, ...BOARD, ...patch }) as Promise<{ result?: string; deny?: string }>

const minutes = (count: number) => count * 60_000

async function master($: Engine, on: On, patch: Record<string, unknown> = { narrative: N }) {
  const writes: string[] = []
  on('fs.write', (_, e) => {
    if (e.path === BOARD_FILE) writes.push(e.text)
    return { value: undefined }
  })
  on('agent.list', () => ({ value: [] }))
  const run = await started($, on, { ...BOARD, ...patch })
  return { ...run, writes }
}

const stripOf = async (ui: Ui) => {
  const texts = await ui.findAll({ type: 'Text' })
  return { texts, age: texts.findIndex(one => String(one.text).startsWith('written ')) }
}

const rowsShown = async (ui: Ui) => {
  const { texts, age } = await stripOf(ui)
  return age < 0 ? [] : texts.slice(0, age).map(one => String(one.text))
}

const textShown = async (ui: Ui) => (await rowsShown(ui)).join(' ')

const ageShown = async (ui: Ui) => {
  const { texts, age } = await stripOf(ui)
  return age < 0 ? '' : String(texts[age]?.text)
}

const colorShown = async (ui: Ui) => (await stripOf(ui)).texts[0]?.props.color

const wholeOf = async (ui: Ui) => {
  const { texts, age } = await stripOf(ui)
  return { text: texts[age - 1], age: texts[age] }
}

const keysOf = async (ui: Ui) => (await ui.findAll({})).map(one => one.key ?? '')

const GONE = ['section-narrative', 'narrative-text', 'narrative-age', 'narrative-age-row', 'narrative-more', 'face-narrative-more']

const pane = ($: Engine, surface: 'desktop' | 'terminal' = 'desktop') => $.ui.mount({ ...PANE, surface })

const rest = async (ui: Ui) => {
  const { texts, age } = await stripOf(ui)
  return texts.slice(age + 1).map(one => String(one.text))
}

test('AC1 the narrative is the first block of the body: its section comes before the summary, with the text and "written just now"', async ($, on) => {
  await master($, on)
  const ui = await pane($)
  const keys = await keysOf(ui)
  expect(keys.indexOf('section-narrative')).toBeGreaterThan(-1)
  expect(keys.indexOf('section-narrative')).toBeLessThan(keys.indexOf('section-summary'))
  expect(await textShown(ui)).toBe(N)
  expect(await ageShown(ui)).toBe('written just now')
  const section = await ui.find({ key: 'section-narrative' })
  expect([section?.props.paddingLeft, section?.props.paddingRight, section?.props.paddingTop, section?.props.gap]).toEqual([across(16), across(16), down(12), down(4)])
  await ui.unmount()
})

test('AC2 three minutes later the age reads "written 3m ago" and the text stays', async ($, on) => {
  const run = await master($, on)
  const ui = await pane($)
  await run.clock.advance(minutes(3))
  expect(await ageShown(ui)).toBe('written 3m ago')
  expect(await textShown(ui)).toBe(N)
  await ui.unmount()
})

test('AC3 a second board call replaces the text and restarts the age', async ($, on) => {
  const run = await master($, on)
  const ui = await pane($)
  await run.clock.advance(minutes(3))
  await call($, { narrative: 'Two workers left. Nothing needs you.' })
  await run.clock.settle()
  expect(await textShown(ui)).toBe('Two workers left. Nothing needs you.')
  expect(await ageShown(ui)).toBe('written just now')
  await ui.unmount()
})

test('AC4 a board call with no narrative, "", spaces or "—" clears it: no element and no text', async ($, on) => {
  const run = await master($, on)
  const ui = await pane($)
  for (const patch of [{ narrative: undefined }, { narrative: '' }, { narrative: '   ' }, { narrative: '—' }]) {
    await call($, { narrative: N })
    await run.clock.settle()
    expect(await textShown(ui)).toBe(N)
    await call($, patch)
    await run.clock.settle()
    const keys = await keysOf(ui)
    expect(GONE.filter(key => keys.includes(key))).toEqual([])
    expect((await textsOf(ui)).some(text => String(text).includes('pane-header is in review'))).toBe(false)
  }
  await ui.unmount()
})

test('AC5 without a narrative the pane draws exactly the same texts as with one, minus its own', async ($, on) => {
  const run = await master($, on, {})
  const ui = await pane($)
  expect((await keysOf(ui)).includes('section-narrative')).toBe(false)
  const before = await rest(ui)
  await call($, { narrative: N })
  await run.clock.settle()
  expect(await textShown(ui)).toBe(N)
  expect(await rest(ui)).toEqual(before)
  await ui.unmount()
})

test('AC6 a board restored from the transcript hides the narrative until the next board call', async ($, on) => {
  const seeded: Record<string, unknown> = {}
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key in seeded ? { value: { ...real.value, value: seeded[e.key] } } : real) as never
  })
  const run = await master($, on)
  const ui = await pane($)
  expect(await textShown(ui)).toBe(N)
  const restored = boardFromJson({ ...BOARD, narrative: N }, 'tool')
  expect(restored?.narrative).toBe(N)
  expect(restored?.at).toBeUndefined()
  seeded.board = restored
  await run.clock.advance(LIVE_MS)
  expect((await keysOf(ui)).includes('section-narrative')).toBe(false)
  delete seeded.board
  await call($, { narrative: N })
  await run.clock.settle()
  expect(await ageShown(ui)).toBe('written just now')
  await ui.unmount()
})

test('AC7 a second before the limit the age reads 14m with no "stale" and the text keeps its colour', async ($, on) => {
  const run = await master($, on)
  const ui = await pane($)
  const fresh = await colorShown(ui)
  await run.clock.advance(minutes(15) - 1_000)
  expect(await ageShown(ui)).toBe('written 14m ago')
  expect(await colorShown(ui)).toBe(fresh)
  await ui.unmount()
})

test('AC8 at the limit the age reads "15m ago · stale" and the text turns muted', async ($, on) => {
  const run = await master($, on)
  const ui = await pane($)
  const fresh = await colorShown(ui)
  await run.clock.advance(minutes(15))
  expect(await ageShown(ui)).toBe('written 15m ago · stale')
  expect(await colorShown(ui)).not.toBe(fresh)
  expect(await colorShown(ui)).toBe(C.muted)
  expect((await keysOf(ui)).some(key => key.includes('narrative-icon'))).toBe(false)
  await ui.unmount()
})

test('AC9 an hour and five minutes reads "1h 5m ago · stale" and the text stays whole', { timeoutMs: 30_000 }, async ($, on) => {
  const run = await master($, on)
  const ui = await pane($)
  await run.clock.advance(minutes(15))
  await run.clock.advance(minutes(50))
  expect(await ageShown(ui)).toBe('written 1h 5m ago · stale')
  expect(await textShown(ui)).toBe(N)
  await ui.unmount()
})

test('AC10 a 700-character narrative is answered "Board updated", stored as 500 characters plus "…"', { timeoutMs: 30_000 }, async ($, on) => {
  const words = 'abcd '.repeat(140).trim()
  const kept = `${Array.from(words).slice(0, 500).join('')}…`
  const run = await master($, on, { narrative: words })
  expect(run.answer).toMatchObject({ result: expect.stringMatching(/^Board updated/) })
  expect(boardFromJson({ ...BOARD, narrative: words })?.narrative).toBe(kept)
  expect(Array.from(kept)).toHaveLength(501)
  const ui = await pane($)
  await click(ui, 'hit-narrative-more')
  await run.clock.settle()
  expect(await textShown(ui)).toBe(kept)
  await ui.unmount()
})

test('AC11 control characters go, whitespace runs collapse to one space', async ($, on) => {
  await master($, on, { narrative: 'Line one.\n\n\tLine  two.\u0007' })
  const ui = await pane($)
  expect(await textShown(ui)).toBe('Line one. Line two.')
  await ui.unmount()
})

test('AC12 markdown is shown as sent: no Markdown or Link element', async ($, on) => {
  await master($, on, { narrative: '**Bold** and [link](https://example.test)' })
  const ui = await pane($)
  expect(await textShown(ui)).toBe('**Bold** and [link](https://example.test)')
  expect(await ui.findAll({ type: 'Markdown' })).toEqual([])
  expect(await ui.findAll({ type: 'Link' })).toEqual([])
  await ui.unmount()
})

test('AC13 a 500-character narrative holds three rows, the last ending in "…", with More', async ($, on) => {
  await master($, on, { narrative: LONG })
  const ui = await pane($)
  const rows = await rowsShown(ui)
  expect(rows).toEqual(rowsOf(LONG, bodyWidthOf(60), 13, 3))
  expect(rows).toHaveLength(3)
  expect(rows[2]?.endsWith('…')).toBe(true)
  expect(String((await ui.find({ key: 'face-narrative-more' }))?.text).trim()).toBe('More')
  await ui.unmount()
})

test('AC14 More opens the whole text and reads Less; pressing again folds it', async ($, on) => {
  const run = await master($, on, { narrative: LONG })
  const ui = await pane($)
  await click(ui, 'hit-narrative-more')
  await run.clock.settle()
  expect(await textShown(ui)).toBe(LONG)
  expect(String((await ui.find({ key: 'face-narrative-more' }))?.text).trim()).toBe('Less')
  await click(ui, 'hit-narrative-more')
  await run.clock.settle()
  expect(await rowsShown(ui)).toHaveLength(3)
  expect(String((await ui.find({ key: 'face-narrative-more' }))?.text).trim()).toBe('More')
  await ui.unmount()
})

test('AC15 a narrative that fits three rows has no More button', async ($, on) => {
  await master($, on)
  const ui = await pane($)
  expect((await rowsShown(ui)).length).toBeLessThanOrEqual(3)
  expect((await keysOf(ui)).includes('face-narrative-more')).toBe(false)
  await ui.unmount()
})

test('AC16 an open narrative stays open across a board call with a new long text', async ($, on) => {
  const run = await master($, on, { narrative: LONG })
  const ui = await pane($)
  await click(ui, 'hit-narrative-more')
  await run.clock.settle()
  const next = LONG.split('').reverse().join('')
  await call($, { narrative: next })
  await run.clock.settle()
  expect(await textShown(ui)).toBe(next)
  expect(String((await ui.find({ key: 'face-narrative-more' }))?.text).trim()).toBe('Less')
  await ui.unmount()
})

test('AC17 a hot reload folds it again', async ($, on) => {
  const run = await master($, on, { narrative: LONG })
  const ui = await pane($)
  await click(ui, 'hit-narrative-more')
  await run.clock.settle()
  expect(await rowsShown(ui)).not.toHaveLength(3)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  expect(await rowsShown(ui)).toHaveLength(3)
  expect(String((await ui.find({ key: 'face-narrative-more' }))?.text).trim()).toBe('More')
  await ui.unmount()
})

test('AC18 the band draws the same texts and alts with and without a narrative', async ($, on) => {
  const run = await master($, on, {})
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const before = [await textsOf(band), await altsOf(band)]
  await call($, { narrative: N })
  await run.clock.settle()
  expect([await textsOf(band), await altsOf(band)]).toEqual(before)
  await band.unmount()
})

test('AC19 the header, chips, tiles and rows read the same with and without a narrative', async ($, on) => {
  const run = await master($, on, {})
  const ui = await pane($)
  const before = [await rest(ui), await altsOf(ui)]
  await call($, { narrative: N })
  await run.clock.settle()
  expect([await rest(ui), await altsOf(ui)]).toEqual(before)
  await ui.unmount()
})

test('AC20 the tick redraws on a narrative label change and on no other quiet tick', async ($, on) => {
  const drawn = { count: 0, at: [] as number[] }
  on('ui.invalidate', (_, e, next) => {
    drawn.count += 1
    return next(e)
  })
  const seeded: Record<string, unknown> = {}
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key in seeded ? { value: { ...real.value, value: seeded[e.key] } } : real) as never
  })
  const ONE = { ...BOARD, narrative: N, sessions: [{ id: 'local_env', name: 'env-e2e-test', state: 'working', progress: 'step 1 of 2 — fix' }], needsYou: [] }
  const run = await started($, on, ONE)
  const start = 3_600_000
  seeded.agents = []
  seeded.workflows = []
  seeded.live = { self: SELF, title: '', sessions: [], error: '', at: start + 30_000 }
  seeded.board = { ...boardFromJson(ONE, 'tool'), since: start - 30_000, at: start }
  await run.clock.advance(minutes(3))
  const ui = await pane($)
  const seen: string[] = []
  const redrawn: number[] = []
  for (let tick = 1; tick <= minutes(3) / TICK_MS; tick += 1) {
    const before = drawn.count
    await run.clock.advance(TICK_MS)
    const age = await ageShown(ui)
    if (age !== seen.at(-1)) seen.push(age)
    if (drawn.count > before) redrawn.push(tick)
  }
  expect(seen).toEqual(['written 3m ago', 'written 4m ago', 'written 5m ago', 'written 6m ago'])
  expect(redrawn).toEqual([30, 60, 90, 120, 150, 180])
  await ui.unmount()
})

test('AC21 a closed pane is not redrawn by the narrative age', async ($, on) => {
  const drawn = { count: 0 }
  on('ui.invalidate', (_, e, next) => {
    drawn.count += 1
    return next(e)
  })
  on('fs.write', () => ({ value: undefined }))
  const run = await started($, on, { ...BOARD, narrative: N }, { isPaneOpen: false })
  const before = drawn.count
  await run.clock.advance(minutes(5))
  expect(drawn.count).toBe(before)
})

test('AC22 a narrative adds no git, session call, transcript scan or file write', async ($, on) => {
  const run = await master($, on, {})
  const tally = () => [run.gits.length, run.calls.length, run.scans.messages, run.writes.length]
  const period = async (patch: Record<string, unknown>) => {
    const before = tally()
    await call($, patch)
    await run.clock.advance(9 * FILE_MS)
    await run.clock.advance(LIVE_MS)
    return tally().map((count, index) => count - (before[index] ?? 0))
  }
  await period({})
  const plain = await period({})
  const narrated = await period({ narrative: N })
  expect(narrated).toEqual(plain)
})

test('AC23 a narrative-only board call starts the same processes and session calls as a plain one', async ($, on) => {
  const run = await master($, on, {})
  const tally = () => [run.gits.length, run.calls.length]
  const delta = async (patch: Record<string, unknown>) => {
    const before = tally()
    await call($, patch)
    await run.clock.settle()
    return tally().map((count, index) => count - (before[index] ?? 0))
  }
  await delta({})
  const plain = await delta({})
  expect(await delta({ narrative: N })).toEqual(plain)
})

test('AC24 the board file carries no narrative key and none of its text', async ($, on) => {
  const run = await master($, on)
  await run.clock.advance(LIVE_MS)
  expect(run.writes.length).toBeGreaterThan(0)
  for (const text of run.writes) {
    expect(Object.keys((JSON.parse(text) as { board: object }).board)).not.toContain('narrative')
    expect(text).not.toContain('pane-header is in review')
  }
})

test('AC25 a board call that changes only the narrative writes no board file', async ($, on) => {
  const run = await master($, on)
  await run.clock.advance(FILE_MS)
  const before = run.writes.length
  await call($, { narrative: 'Something else entirely.' })
  await run.clock.advance(FILE_MS)
  expect(run.writes.length).toBe(before)
})

const fileOf = (masterId: string, board: unknown) => JSON.stringify({ v: 1, kind: 'board', at: 3_600_000, masterId, board })

const reportFor = (parent: string) => JSON.stringify({ v: 1, kind: 'status', session: 'local_env', parent, seq: 1, at: 3_590_000, run: { isRunning: true }, modelAt: 3_590_000, state: 'working', activity: [], commits: [], tests: [], files: [] })

const reportAt = `${HOME}/.claude/state/master-session/sessions/local_env.json`

const boardAt = (id: string) => `${HOME}/.claude/state/master-session/boards/${id}.json`

test('AC26 a worker shows only its note and its reports answer never holds the master’s narrative', async ($, on) => {
  on('fs.write', () => ({ value: undefined }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  const hand = { ...BOARD, narrative: 'secret-plan' }
  const child = childOf(3_600_000, hand)
  const files = { ...child.files, [boardAt('local_worker')]: fileOf('local_worker', hand), [reportAt]: reportFor(MASTER) }
  const run = world(on, { ...child, files })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await run.clock.advance(3_000)
  const ui = await pane($)
  const texts = (await textsOf(ui)).map(String)
  expect(texts.some(text => text.includes('secret-plan'))).toBe(false)
  expect(texts).toHaveLength(1)
  const listed = (await $.tool.call({ tool: REPORTS_TOOL })) as { result?: string }
  expect(String(listed.result)).toContain('local_env')
  expect(JSON.stringify(listed)).not.toContain('secret-plan')
  expect(JSON.stringify(listed)).not.toContain('narrative')
  expect(MASTER).toBe('local_master')
  await ui.unmount()
})

test('AC26 a master whose board atom and board file carry a narrative answers its reports tool without it', async ($, on) => {
  on('fs.write', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] }))
  const files = { [boardAt(SELF)]: fileOf(SELF, { ...BOARD, narrative: N }), [reportAt]: reportFor(SELF) }
  const run = await started($, on, { ...BOARD, narrative: N }, { files })
  await run.clock.advance(LIVE_MS)
  const listed = (await $.tool.call({ tool: REPORTS_TOOL })) as { result?: string }
  expect(String(listed.result)).toContain('local_env')
  expect(JSON.stringify(listed)).not.toContain('narrative')
  expect(JSON.stringify(listed)).not.toContain('pane-header is in review')
})

test('AC27 a plain session draws no narrative, writes no file and keeps the band as before', async ($, on) => {
  const writes: string[] = []
  on('fs.write', (_, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.tool.call({ tool: 'mcp__master-session__open' })
  await run.clock.advance(LIVE_MS)
  const ui = await pane($)
  expect((await keysOf(ui)).some(key => key.includes('narrative'))).toBe(false)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await keysOf(band)).not.toContain('section-narrative')
  expect(writes).toEqual([])
  expect((await textsOf(band)).map(String)).toEqual(['engine'])
  await band.unmount()
  await ui.unmount()
})

test('AC28 the terminal draws the whole text between the header and the summary, with a dim age and no button', async ($, on) => {
  await master($, on, { narrative: LONG })
  const ui = await pane($, 'terminal')
  const keys = await keysOf(ui)
  expect(keys.indexOf('section-narrative')).toBeGreaterThan(keys.indexOf('section-header'))
  expect(keys.indexOf('section-narrative')).toBeLessThan(keys.indexOf('section-summary'))
  const { text, age } = await wholeOf(ui)
  expect(String(text?.text)).toBe(LONG)
  expect(keys.some(key => key.includes('narrative-more'))).toBe(false)
  expect(String(age?.text)).toBe('written just now')
  expect(age?.props.dimColor).toBe(true)
  expect(text?.props.dimColor).toBeFalsy()
  await ui.unmount()
})

test('AC29 a stale narrative in the terminal dims its text too', async ($, on) => {
  const run = await master($, on)
  const ui = await pane($, 'terminal')
  await run.clock.advance(minutes(15))
  const { text, age } = await wholeOf(ui)
  expect(String(age?.text)).toBe('written 15m ago · stale')
  expect(text?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('AC30 the scroll tool reaches section-narrative while it is drawn and refuses it when absent', async ($, on) => {
  on('ui.scroll', (() => ({ value: {} })) as never)
  const run = await master($, on)
  const ui = await pane($)
  const scrolled = (await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'section-narrative' })) as { result?: string; deny?: string }
  expect(String(scrolled.result ?? scrolled.deny)).toContain('(row 0)')
  expect(String(scrolled.deny ?? '')).not.toContain('not drawn')
  await call($, {})
  await run.clock.settle()
  const refused = (await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'section-narrative' })) as { deny?: string }
  expect(String(refused.deny)).toContain('section-narrative is not drawn')
  await ui.unmount()
})

test('AC31 the schema carries narrative as an optional string with no maxLength, and section-narrative follows the header', () => {
  const narrative = (BOARD_SCHEMA.properties as Record<string, Record<string, unknown>>).narrative
  expect(narrative?.type).toBe('string')
  expect(String(narrative?.description)).toContain('at most 500 characters')
  expect(narrative).not.toHaveProperty('maxLength')
  expect(BOARD_SCHEMA.required).toEqual(['sessions'])
  expect(SECTIONS[1]).toBe('section-narrative')
})
