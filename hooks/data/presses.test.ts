import { expect, test } from 'claude-code/testing'

import { addFault, clearFaults, hasFaults, nextRetryMs } from './presses'

test('only the first fault of a run asks for a retry, and the retry clears every fault', async () => {
  expect(addFault('hit-refresh')).toBe(true)
  expect(addFault('hit-tile-local_env')).toBe(false)
  expect(hasFaults()).toBe(true)
  clearFaults()
  expect(hasFaults()).toBe(false)
  expect(addFault('hit-refresh')).toBe(true)
  clearFaults()
})

test('the retry waits 5 s, doubling each time up to one minute', async () => {
  expect(Array.from({ length: 6 }, () => nextRetryMs())).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000])
})
