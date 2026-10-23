import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BOARD, BOARD_TOOL, HOME, SELF, SPAWN, warmUp, world } from '../testing/world'

warmUp()

const BOARD_FILE = `${HOME}/.claude/state/master-session/boards/${SELF}.json`

async function master($: Engine, on: On) {
  const writes: string[] = []
  on('fs.write', (_, e) => {
    if (e.path === BOARD_FILE) writes.push(e.text)
    return { value: undefined }
  })
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await run.clock.settle()
  return { writes, clock: run.clock }
}

test('the master writes only the board its workers’ detection reads: id, time and sessions', async ($, on) => {
  const { writes } = await master($, on)
  const file = JSON.parse(writes.at(-1) ?? '{}') as Record<string, unknown> & { board?: { since?: number } }
  expect(Object.keys(file).sort()).toEqual(['at', 'board', 'kind', 'masterId', 'v'])
  expect(file.board?.since).toBeGreaterThan(0)
})

test('unchanged ticks and subagent starts write nothing, and one session change writes exactly once', async ($, on) => {
  const { writes, clock } = await master($, on)
  await clock.advance(9_000)
  const settled = writes.length
  await clock.advance(120_000)
  expect(writes.length).toBe(settled)
  await $.agent.spawn({ ...SPAWN, name: 'helper', description: 'help', subagentType: 'general-purpose' })
  await clock.advance(60_000)
  expect(writes.length).toBe(settled)
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD, sessions: BOARD.sessions.map(one => ({ ...one, now: 'something new' })) })
  await clock.advance(60_000)
  expect(writes.length).toBe(settled + 1)
})
