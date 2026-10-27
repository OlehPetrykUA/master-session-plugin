import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { BOARD, BOARD_TOOL, HOME, PANE, SPAWN, world } from '../testing/world'
import type { Child } from '../testing/world'

const SECONDS = 300
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const ONE = { ...BOARD, sessions: BOARD.sessions.slice(0, 1), needsYou: [], narrative: 'Two workers are running. env-e2e-test needs you to approve a settings edit. Nothing else is pending.' }

type Cost = {
  fired: number
  worked: number
  render: number
  invalidate: number
  process: number
  mcp: number
  read: number
  write: number
  model: number
}

function running(on: On, count: number) {
  const ids = Array.from({ length: count }, (_, index) => `a${index + 1}`)
  let next = 0
  on('agent.list', () => ({ value: ids.map((id): AgentInfo => ({ id, description: `task ${id}`, type: 'general-purpose', status: 'running' })) }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: ids[next++ % ids.length] ?? 'a1' }))
  on('classic.PermissionRequest', () => ({}))
  on('classic.Notification', () => ({}))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
}

async function measured($: Engine, on: On, child: Child, subagents: number, open: boolean, board: boolean): Promise<Cost> {
  const extra = { render: 0, invalidate: 0, write: 0, model: 0 }
  running(on, subagents)
  const run = world(on, child)
  on('ui.invalidate', (_, e, next) => {
    extra.invalidate += 1
    if (e.event === 'ui.render') extra.render += 1
    return next(e)
  })
  on('fs.write', () => {
    extra.write += 1
    return { value: undefined }
  })
  on('model.complete', () => {
    extra.model += 1
    return { value: { isAnswered: true as const, text: 'Two workers are running. Nothing else is pending.', usage: USAGE } }
  })
  const now = (): Cost => ({
    fired: run.timers.fired,
    worked: 0,
    render: extra.render,
    invalidate: extra.invalidate,
    process: run.gits.length,
    mcp: run.calls.length,
    read: run.reads.count,
    write: extra.write,
    model: extra.model,
  })
  const work = (one: Cost) => one.render + one.invalidate + one.process + one.mcp + one.read + one.write + one.model
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  if (board) await $.tool.call({ tool: BOARD_TOOL, ...ONE })
  await run.clock.settle()
  const ui = open ? await $.ui.mount({ ...PANE, surface: 'desktop' }) : undefined
  for (let index = 0; index < subagents; index += 1) await $.agent.spawn({ ...SPAWN, description: `Docs lookup ${index}`, subagentType: 'Explore' })
  await run.clock.settle()
  const base = now()
  let worked = 0
  for (let second = 0; second < SECONDS; second += 1) {
    const before = now()
    await run.clock.advance(1000)
    const after = now()
    if (after.fired > before.fired && work(after) > work(before)) worked += 1
  }
  const end = now()
  await ui?.unmount()
  return {
    fired: end.fired - base.fired,
    worked,
    render: end.render - base.render,
    invalidate: end.invalidate - base.invalidate,
    process: end.process - base.process,
    mcp: end.mcp - base.mcp,
    read: end.read - base.read,
    write: end.write - base.write,
    model: end.model,
  }
}

const BOUNDS: Record<'plain' | 'closed' | 'open', Cost> = {
  plain: { fired: 520, worked: 0, render: 0, invalidate: 0, process: 0, mcp: 0, read: 0, write: 0, model: 0 },
  closed: { fired: 520, worked: 100, render: 0, invalidate: 0, process: 114, mcp: 20, read: 160, write: 0, model: 2 },
  open: { fired: 520, worked: 140, render: 64, invalidate: 64, process: 114, mcp: 20, read: 160, write: 0, model: 2 },
}

function within(cost: Cost, bound: Cost) {
  for (const key of Object.keys(bound) as (keyof Cost)[]) expect([key, cost[key] <= bound[key]]).toEqual([key, true])
}

test('cost: a plain chat that spawns one subagent', async ($, on) => {
  within(await measured($, on, {}, 1, false, false), BOUNDS.plain)
})

test('cost: a master with the pane closed and two running subagents', async ($, on) => {
  within(await measured($, on, { isPaneOpen: false }, 2, false, true), BOUNDS.closed)
})

test('cost: a master with the pane open, two running subagents and one board session', async ($, on) => {
  within(await measured($, on, {}, 2, true, true), BOUNDS.open)
})
