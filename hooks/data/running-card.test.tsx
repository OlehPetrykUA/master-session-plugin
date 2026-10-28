import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PANE, SELF, started, textsOf, warmUp } from '../testing/world'

warmUp()

const NOW = 3_600_000

const SECONDS = /^\d+s$/

function seeded(on: On, startedAt: number) {
  const all: Record<string, unknown> = {
    agents: [{ id: 'w1', type: 'workflow-subagent', prompt: 'go', description: 'scan', state: 'running', startedAt, run: { id: 'wf_1', index: 0 } }],
    workflows: [{ id: 'wf_1', toolUseId: 't', name: 'audit', phases: [], startedAt }],
    live: { self: SELF, title: '', sessions: [], error: '', at: 1 },
  }
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key in all ? { value: { ...real.value, value: all[e.key] } } : real) as never
  })
}

async function redrawsIn3s(on: On, $: Engine, startedAt: number) {
  seeded(on, startedAt)
  const drawn = { count: 0 }
  on('ui.invalidate', (_, e, next) => {
    drawn.count += 1
    return next(e)
  })
  const run = await started($, on)
  await $.tool.call({ tool: 'mcp__master-session__open', expand: 'wf_1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await run.clock.advance(1_000)
  const before = drawn.count
  await run.clock.advance(3_000)
  const texts = (await textsOf(ui)).map(String)
  await ui.unmount()
  return { redraws: drawn.count - before, texts }
}

test('an open running workflow card older than a minute reads whole minutes and is not redrawn by the seconds', async ($, on) => {
  const { redraws, texts } = await redrawsIn3s(on, $, NOW - 125_000)
  expect(texts.some(text => /^running 2m\b/.test(text) || text === '2m')).toBe(true)
  expect(texts.some(text => /\d+m \d{2}s/.test(text))).toBe(false)
  expect(redraws).toBe(0)
})

test('an open running workflow card under a minute is redrawn each second', async ($, on) => {
  const { redraws, texts } = await redrawsIn3s(on, $, NOW - 1_000)
  expect(texts.some(text => SECONDS.test(text))).toBe(true)
  expect(redraws).toBe(3)
})
