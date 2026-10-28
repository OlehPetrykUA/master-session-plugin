import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { LIVE_MS } from '../../lib/constants'
import { CREDENTIALS } from '../../testing/credentials'
import { BAND, BOARD, SPAWN, started, textsOf, altsOf, warmUp } from '../../testing/world'

warmUp()

const gates = new Map<string, () => void>()

const BOARD_ONE = { ...BOARD, sessions: [{ id: 'local_s', name: 's', title: 'Implementer · Row details', state: 'waiting', progress: 'step 1 of 3 — x' }], needsYou: [] }

function loops(on: On) {
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'task a1', type: 'general-purpose', status: 'running' } satisfies AgentInfo] }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('classic.PermissionRequest', () => ({}))
  on('classic.Notification', () => ({}))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', async (_, e) => {
    await new Promise<void>(done => gates.set(e.tool_use_id, done))
    return { result: { stdout: '', stderr: '', interrupted: false }, text: '' } as never
  })
}

type Input = Parameters<Engine['tool']['call']>[0]

let seq = 0

async function master($: Engine, on: On) {
  loops(on)
  const run = await started($, on, BOARD_ONE, { isPaneOpen: false })
  await $.agent.spawn({ ...SPAWN, description: 'Find callers', subagentType: 'Explore' })
  await run.clock.settle()
  return run
}

async function hold($: Engine, run: Awaited<ReturnType<typeof master>>, input: Record<string, unknown>) {
  seq += 1
  const id = `toolu_band_${seq}`
  const call = $.tool.call({ tool_use_id: id, ...input } as unknown as Input)
  await run.clock.advance(1)
  return async () => {
    gates.get(id)?.()
    await call
  }
}

test('AC49 no persona, task, tool or command text in the band: for every credential command the band shows none of it, on the desktop and in the terminal', { timeoutMs: 30_000 }, async ($, on) => {
  const run = await master($, on)
  for (const surface of ['desktop', 'terminal'] as const) {
    for (const [, command, secrets] of CREDENTIALS.filter((_, index) => surface === 'desktop' || index % 4 === 0)) {
      const end = await hold($, run, { tool: 'Bash', command, agentId: 'a1' })
      const ui = await $.ui.mount({ ...BAND, surface })
      const all = JSON.stringify([await textsOf(ui), await altsOf(ui)])
      expect(all).not.toContain(command)
      expect(secrets.filter(secret => all.includes(secret))).toEqual([])
      for (const word of ['Bash', 'Implementer', 'Row details', 'Find callers', 'Explore', 'more', 'Nothing running', 'waiting']) expect(all).not.toContain(word)
      await ui.unmount()
      await end()
    }
  }
})

test('AC62 and AC32 a tool call never redraws the band; the minute rolling over redraws it once, at the next live check', async ($, on) => {
  const invalidated = { count: 0 }
  on('ui.invalidate', (_, e, next) => {
    if (e.event === 'ui.render') invalidated.count += 1
    return next(e)
  })
  const run = await master($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await textsOf(ui)).some(one => String(one).includes('Bash'))).toBe(false)
  const minutes = async () => {
    const text = (await textsOf(ui)).map(one => String(one).trim()).find(one => /^(<1|\d+)m$/.test(one))
    return text === '<1m' ? 0 : Number(text?.slice(0, -1))
  }
  const seen = async () => ({ count: invalidated.count, minutes: await minutes() })
  await run.clock.advance(LIVE_MS)
  const quiet = await seen()
  const end = await hold($, run, { tool: 'Bash', command: 'npm test --silent', agentId: 'a1' })
  await run.clock.advance(LIVE_MS)
  const during = await seen()
  expect(during.count - quiet.count).toBe(during.minutes - quiet.minutes)
  expect((await textsOf(ui)).some(one => String(one).includes('Bash'))).toBe(false)
  await end()
  await run.clock.advance(LIVE_MS)
  const after = await seen()
  expect(after.count - during.count).toBe(after.minutes - during.minutes)
  await run.clock.advance(60_000)
  const rolled = await seen()
  expect([rolled.count - after.count, rolled.minutes - after.minutes]).toEqual([1, 1])
  await ui.unmount()
})
