import { expect, test } from 'claude-code/testing'
import type { Engine, FoundElement } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { PlanPiece } from '../../../types'

import { BAR_MIN } from '../../lib/band'
import { bandPauseOf } from '../../lib/bandpause'
import { LIVE_MS } from '../../lib/constants'
import { CH, textWidth } from '../../lib/layout'
import { IDLE_PAUSE } from '../../lib/pause'
import { BAND, BOARD_TOOL, PANE, click, started, warmUp } from '../../testing/world'
import { PERCENT } from '../../theme/band'
import { C } from '../../theme/tokens'

warmUp()

const piece = (name: string, state: PlanPiece['state'], progress?: string): PlanPiece => ({ name, state, ...(progress ? { progress } : {}) })

const SEVEN = [piece('a', 'done'), piece('b', 'done'), piece('c', 'done'), piece('d', 'working', 'step 1 of 2 — x'), piece('e', 'working', 'step 1 of 2 — x'), piece('f', 'queued'), piece('g', 'queued')]

const SESSIONS = [
  { id: 'local_a', name: 'setup-ui-redo', state: 'waiting', progress: 'step 4 of 5 — mockups' },
  { id: 'local_b', name: 'mod-ui', state: 'working', progress: 'step 3 of 5 — pane' },
]

const publish = (extra: Record<string, unknown> = {}) => ({ tick: '09:00', sessions: SESSIONS, needsYou: [], repos: [], plan: SEVEN, ...extra })

const COUNTED = new Set(['clock.every', 'clock.after', 'clock.sleep'])

const columnsFor = (width: number) => Math.ceil((width + 16) / CH)

const WORDS = /^(Pausing|Paused|Resuming)$/

type Found = { findAll: (query: { type?: string }) => Promise<FoundElement[]>; find: (query: { key?: string }) => Promise<FoundElement | undefined> }

const textsOf = async (ui: Found) => (await ui.findAll({ type: 'Text' })).map(one => one.text.replace(/\s/g, ''))

const stripOf = async (ui: Found) => String((await ui.findAll({ type: 'Svg' })).find(one => String(one.props.source).includes('width="4096"'))?.props.source)

const barWidthOf = async (ui: Found) => Number(/viewBox="0 0 ([\d.]+) 6"/.exec(await stripOf(ui))?.[1])

async function setup($: Engine, on: On) {
  const prompts: string[] = []
  const timers = { every: 0, after: 0, sleep: 0 }
  const renders = { count: 0 }
  const spied = new Proxy(on, {
    apply(target, self, args: unknown[]) {
      const last = args.length - 1
      const handler = args[last]
      const name = String(args[0])
      if (typeof handler === 'function' && COUNTED.has(name)) {
        args[last] = (...inner: unknown[]) => {
          timers[name.slice(6) as keyof typeof timers] += 1
          return handler(...inner)
        }
      }
      return Reflect.apply(target, self, args)
    },
  })
  on('ui.invalidate', (_, e, next) => {
    if (e.event === 'ui.render') renders.count += 1
    return next(e)
  })
  on('agent.list', () => ({ value: [] }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('classic.UserPromptSubmit', () => ({}))
  on('fs.write', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.abort', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  const run = await started($, spied as On, publish(), { isPaneOpen: false })
  let turns = 0
  const press = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await click(ui, 'hit-pause')
    await run.clock.settle()
    await ui.unmount()
  }
  const settle = async () => {
    turns += 1
    const turnId = `settle${turns}`
    await $.turn.start({ text: prompts.at(-1) ?? '', turnId })
    await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await run.clock.settle()
  }
  const band = (surface: 'desktop' | 'terminal', width = 900) => $.ui.mount({ ...BAND, surface, props: { ...BAND.props, bodyColumns: surface === 'terminal' ? width : columnsFor(width) } })
  return { ...run, timers, renders, press, settle, band }
}

test('AC17 one line per state: the word takes the percent place; bar, 3/7, elapsed and Open board stay; no percent, no Stopping, no Paused at', { timeoutMs: 60_000 }, async ($, on) => {
  const run = await setup($, on)
  const steps = [
    ['Pausing', () => run.press()],
    ['Paused', () => run.settle()],
    ['Resuming', () => run.press()],
  ] as const
  for (const [word, go] of steps) {
    await go()
    for (const surface of ['desktop', 'terminal'] as const) {
      const ui = await run.band(surface)
      const texts = await textsOf(ui)
      expect(texts[0]).toBe(word)
      expect(texts.filter(one => WORDS.test(one))).toEqual([word])
      expect(texts).toContain('3/7')
      expect(texts.some(one => /%/.test(one) || /Stopping|Paused at/.test(one))).toBe(false)
      expect(texts.some(one => /^◷?(<1m|\d+m)$/.test(one))).toBe(true)
      if (surface === 'desktop') expect(texts.at(-1)).toBe('Openboard')
      if (surface === 'terminal') {
        expect((await ui.findAll({ type: 'Button' })).map(one => one.props.label)).toEqual(['Open board'])
        expect(texts.filter(one => /^[█░]+$/.test(one))).toHaveLength(1)
        expect((await ui.findAll({ type: 'Box' })).filter(one => one.props.flexDirection === 'column')).toEqual([])
      } else {
        expect(await stripOf(ui)).toContain('width="4096"')
        expect((await ui.findAll({ type: 'Button' })).length + (await ui.findAll({ type: 'Client' })).length).toBeGreaterThan(0)
      }
      await ui.unmount()
    }
  }
  await run.settle()
  const ui = await run.band('desktop')
  expect((await textsOf(ui))[0]).toMatch(/^\d+%$/)
  await ui.unmount()
})

test('AC18 the paused band: Paused in amber (terminal warning bold), a grey bar, 3/7 kept; under 340 px no word', { timeoutMs: 60_000 }, async ($, on) => {
  const run = await setup($, on)
  const before = await run.band('desktop')
  const running = await barWidthOf(before)
  const runningSource = await stripOf(before)
  expect(runningSource).toContain('fill:var(--green)')
  await before.unmount()
  await run.press()
  const pausing = await run.band('desktop')
  expect((await stripOf(pausing)).includes('fill:var(--green)')).toBe(true)
  await pausing.unmount()
  await run.settle()
  const desktop = await run.band('desktop')
  const word = (await desktop.findAll({ type: 'Text' })).find(one => one.text === 'Paused')
  expect([word?.props.color, word?.props.weight]).toEqual([C.amber, 'semibold'])
  const source = await stripOf(desktop)
  expect(source).toContain('fill:var(--grey)')
  expect(source).not.toContain('linearGradient')
  expect(source).not.toContain('<animate')
  expect(await textsOf(desktop)).toContain('3/7')
  const drawn = await barWidthOf(desktop)
  const expected = running - (textWidth('Paused', 15, { isBold: true }) - PERCENT)
  expect(Math.abs(drawn - Math.max(BAR_MIN, expected))).toBeLessThanOrEqual(1)
  await desktop.unmount()
  const terminal = await run.band('terminal')
  const found = await terminal.findAll({ type: 'Text' })
  const lead = found.find(one => one.text === 'Paused')
  expect([lead?.props.color, lead?.props.weight]).toEqual(['warning', 'semibold'])
  expect(found.find(one => /^[█░]+$/.test(one.text))?.props.color).toBe('subtle')
  expect(found.find(one => one.text === '3/7')?.props.weight).toBe('semibold')
  await terminal.unmount()
  const small = await run.band('desktop', 330)
  expect((await textsOf(small)).filter(one => WORDS.test(one) || /%|\d\/\d/.test(one))).toEqual([])
  expect((await small.findAll({ type: 'Client' })).length).toBeGreaterThan(0)
  await small.unmount()
  const tiny = await run.band('terminal', 40)
  expect((await textsOf(tiny)).filter(one => WORDS.test(one))).toEqual([])
  await tiny.unmount()
})

test('the text at every band width: desktop 900, 590 and 330 px, and the terminal', { timeoutMs: 60_000 }, async ($, on) => {
  const run = await setup($, on)
  await run.press()
  await run.settle()
  const rows = [
    ['desktop', 900, 'Openboard'],
    ['desktop', 590, 'Board'],
    ['desktop', 330, undefined],
    ['terminal', 100, 'Open board'],
    ['terminal', 40, undefined],
  ] as const
  for (const [surface, width, label] of rows) {
    const ui = await run.band(surface, width)
    const texts = await textsOf(ui)
    const hasWord = label !== undefined
    expect(texts.filter(one => WORDS.test(one))).toEqual(hasWord ? ['Paused'] : [])
    expect(texts.includes('3/7')).toBe(hasWord)
    expect(texts.some(one => /%/.test(one))).toBe(false)
    if (hasWord && surface === 'desktop') expect(texts.at(-1)).toBe(label)
    if (hasWord && surface === 'terminal') expect((await ui.findAll({ type: 'Button' })).map(one => one.props.label)).toEqual([label])
    await ui.unmount()
  }
})

test('O3 a needs-you pill and the all-done lead stay as they are while paused', { timeoutMs: 60_000 }, async ($, on) => {
  const run = await setup($, on)
  await run.press()
  await run.settle()
  const asking = [...SESSIONS, { id: 'local_e', name: 'env-e2e-test', state: 'needs-you', progress: 'step 1 of 2 — fix', needsYou: 'commit blocked' }]
  await $.tool.call({ tool: BOARD_TOOL, ...publish({ sessions: asking }) })
  await run.clock.settle()
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await run.band(surface)
    const texts = await textsOf(ui)
    expect(texts.some(one => WORDS.test(one))).toBe(false)
    expect(texts.some(one => one.includes('needsyou'))).toBe(true)
    await ui.unmount()
  }
  await $.tool.call({ tool: BOARD_TOOL, ...publish({ sessions: SESSIONS.map(one => ({ ...one, state: 'done' })), plan: SEVEN.map(one => piece(one.name, 'done')) }) })
  await run.clock.settle()
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await run.band(surface)
    const texts = await textsOf(ui)
    expect(texts.some(one => WORDS.test(one))).toBe(false)
    expect(texts.some(one => one.includes('All7done'))).toBe(true)
    await ui.unmount()
  }
})

test('AC6 band follows the pause: Pausing before the settle turn completes, Paused after, and back to the percent after Resume', { timeoutMs: 60_000 }, async ($, on) => {
  const run = await setup($, on)
  const lead = async () => {
    const ui = await run.band('desktop')
    const first = (await textsOf(ui))[0]
    await ui.unmount()
    return first
  }
  expect(await lead()).toMatch(/^\d+%$/)
  await run.press()
  expect(await lead()).toBe('Pausing')
  await run.settle()
  expect(await lead()).toBe('Paused')
  await run.press()
  expect(await lead()).toBe('Resuming')
  await run.settle()
  expect(await lead()).toMatch(/^\d+%$/)
})

test('AC10 band half: no new timers, and the band redraws only when the pause state changes', { timeoutMs: 60_000 }, async ($, on) => {
  const run = await setup($, on)
  const ui = await run.band('desktop')
  const base = { ...run.timers }
  await run.press()
  await run.settle()
  await run.press()
  await run.settle()
  expect(run.timers).toEqual(base)
  await run.press()
  await run.settle()
  expect((await textsOf(ui))[0]).toBe('Paused')
  const quiet = { count: run.renders.count, timers: { ...run.timers } }
  await run.clock.advance(LIVE_MS * 3)
  expect(run.renders.count).toBe(quiet.count)
  expect(run.timers.every).toBeGreaterThanOrEqual(quiet.timers.every)
  expect((await textsOf(ui))[0]).toBe('Paused')
  const sources = await ui.findAll({ type: 'Svg' })
  for (const one of sources) expect(String(one.props.source)).not.toContain('<animate')
  const marks = run.renders.count
  await run.press()
  expect(run.renders.count).toBeGreaterThan(marks)
  await ui.unmount()
})

test('bandPauseOf leaves a running state and a view with no percent as it is', () => {
  const view = { hasPercent: false, barWidth: 100 } as Parameters<typeof bandPauseOf>[0]
  expect(bandPauseOf(view, IDLE_PAUSE)).toBe(view)
  expect(bandPauseOf(view, { ...IDLE_PAUSE, state: 'paused' })).toBe(view)
})
