import { expect, test } from 'claude-code/testing'

import { register } from '../register'
import { clearFaults, hasFaults, recoverFault } from './presses'

function fakeClock() {
  let now = 0
  let timers: { at: number; run: () => void }[] = []
  const invalidated: string[] = []
  const $ = {
    clock: { after: (ms: number, run: () => void) => void timers.push({ at: now + ms, run }) },
    ui: { invalidate: (event: string) => void invalidated.push(event) },
  } as never
  const advance = (ms: number) => {
    const end = now + ms
    for (;;) {
      const due = timers.filter(one => one.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      timers = timers.filter(one => one !== due)
      now = due.at
      due.run()
    }
    now = end
  }
  return { $, advance, invalidated }
}

function faultWait(world: ReturnType<typeof fakeClock>) {
  const before = world.invalidated.length
  recoverFault(world.$, 'hit-refresh')
  let waited = 0
  while (world.invalidated.length === before && waited < 120_000) {
    world.advance(1_000)
    waited += 1_000
  }
  return waited
}

function calm(world: ReturnType<typeof fakeClock>) {
  clearFaults()
  faultWait(world)
  world.advance(60_000)
}

test('a fault redraws once the wait is over and clears every fault', async () => {
  const world = fakeClock()
  calm(world)
  recoverFault(world.$, 'hit-refresh')
  recoverFault(world.$, 'hit-ask')
  expect(hasFaults()).toBe(true)
  world.advance(5_000)
  expect(world.invalidated.length).toBe(2)
  expect(hasFaults()).toBe(false)
})

test('faults that keep coming wait 5 s, 10 s, 20 s, 40 s, then 60 s and stay capped', async () => {
  const world = fakeClock()
  calm(world)
  const waits: number[] = []
  for (let round = 0; round < 7; round++) {
    waits.push(faultWait(world))
    world.advance(1_000)
  }
  expect(waits).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000])
})

test('after a retry and 60 s without a fault the next fault waits 5 s again', async () => {
  const world = fakeClock()
  calm(world)
  expect([faultWait(world), faultWait(world), faultWait(world)]).toEqual([5_000, 10_000, 20_000])
  world.advance(60_000)
  expect(faultWait(world)).toBe(5_000)
})

test('a fault inside the 60 s after a retry keeps the wait growing', async () => {
  const world = fakeClock()
  calm(world)
  expect(faultWait(world)).toBe(5_000)
  world.advance(30_000)
  expect(faultWait(world)).toBe(10_000)
})

test('only the newest retry can reset the wait: an older timer firing early does not', async () => {
  const world = fakeClock()
  calm(world)
  expect([faultWait(world), faultWait(world)]).toEqual([5_000, 10_000])
  world.advance(50_000)
  expect(faultWait(world)).toBe(20_000)
})

test('register wires ui.fault to recoverFault: one retry at 5 s, then ui.render is invalidated', async () => {
  const handlers: Record<string, (...args: never[]) => unknown> = {}
  const on = ((name: string, ...rest: unknown[]) => {
    handlers[name] = rest[rest.length - 1] as (...args: never[]) => unknown
    return { catch: () => undefined }
  }) as never
  register(on, {} as never)
  const world = fakeClock()
  calm(world)
  await (handlers['ui.fault'] as (...args: unknown[]) => unknown)(world.$, { element: 'hit-refresh' }, async () => undefined)
  const before = world.invalidated.length
  world.advance(4_999)
  expect(world.invalidated.length).toBe(before)
  world.advance(1)
  expect(world.invalidated.slice(before)).toEqual(['ui.render'])
})
