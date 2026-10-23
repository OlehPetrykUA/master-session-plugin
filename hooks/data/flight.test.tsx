import { expect, test } from 'claude-code/testing'

import { BOARD, BOARD_TOOL, HOME, started, warmUp, world } from '../testing/world'

warmUp()

test('the git scan tick skips while the last scan is still running, so scans never overlap', async ($, on) => {
  const { clock, flights } = await started($, on, BOARD, { slowMs: { git: 2_000 } })
  await clock.advance(300_000)
  expect(flights.git.started).toBeGreaterThan(20)
  expect(flights.git.peak).toBe(1)
})

test('forced refreshes asked while a scan runs wait for it instead of starting another', async ($, on) => {
  const { clock, flights } = await started($, on, BOARD, { slowMs: { git: 2_000 } })
  for (let index = 0; index < 3; index += 1) {
    await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
    await clock.advance(5_000)
  }
  await clock.advance(300_000)
  expect(flights.git.peak).toBe(1)
})

test('the reports tick skips while the last reports read is still running', async ($, on) => {
  const { clock, flights } = await started($, on, BOARD, { slowMs: { list: 10_000 } })
  const before = flights.list.started
  await clock.advance(60_000)
  expect(flights.list.started - before).toBeGreaterThanOrEqual(3)
  expect(flights.list.started - before).toBeLessThanOrEqual(5)
  expect(flights.list.peak).toBe(1)
})

test('the agents tick skips while the last agent list is still running', async ($, on) => {
  const run = world(on)
  let active = 0
  let peak = 0
  let calls = 0
  on('agent.list', async () => {
    active += 1
    calls += 1
    peak = Math.max(peak, active)
    await run.clock.sleep(10_000)
    active -= 1
    return { value: [] }
  })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(60_000)
  expect(calls).toBeGreaterThanOrEqual(3)
  expect(calls).toBeLessThanOrEqual(5)
  expect(peak).toBe(1)
})
