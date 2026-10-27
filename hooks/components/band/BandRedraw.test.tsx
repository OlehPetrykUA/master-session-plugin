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

test('no command text in the band: for every credential command the line shows the tool name only, on the desktop and in the terminal', { timeoutMs: 30_000 }, async ($, on) => {
  const run = await master($, on)
  for (const surface of ['desktop', 'terminal'] as const) {
    for (const [, command, secrets] of CREDENTIALS.filter((_, index) => surface === 'desktop' || index % 4 === 0)) {
      const end = await hold($, run, { tool: 'Bash', command, agentId: 'a1' })
      const ui = await $.ui.mount({ ...BAND, surface })
      const all = JSON.stringify([await textsOf(ui), await altsOf(ui)])
      expect(all).toContain('Bash')
      expect(all).not.toContain(command)
      expect(secrets.filter(secret => all.includes(secret))).toEqual([])
      await ui.unmount()
      await end()
    }
  }
})

test('with the pane closed the band redraws on a data change at the next live check, and not again while nothing it shows changes', async ($, on) => {
  const invalidated = { count: 0 }
  on('ui.invalidate', (_, e, next) => {
    if (e.event === 'ui.render') invalidated.count += 1
    return next(e)
  })
  const run = await master($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await textsOf(ui)).some(one => String(one).includes('Bash'))).toBe(false)
  await run.clock.advance(LIVE_MS)
  const quiet = invalidated.count
  const end = await hold($, run, { tool: 'Bash', command: 'npm test --silent', agentId: 'a1' })
  await run.clock.advance(LIVE_MS)
  expect(invalidated.count).toBe(quiet + 1)
  expect((await textsOf(ui)).some(one => String(one).includes('· Bash'))).toBe(true)
  await run.clock.advance(LIVE_MS * 4)
  expect(invalidated.count).toBe(quiet + 1)
  await end()
  await run.clock.advance(LIVE_MS)
  expect(invalidated.count).toBe(quiet + 2)
  expect((await textsOf(ui)).some(one => String(one).includes('· Bash'))).toBe(false)
  await ui.unmount()
})
