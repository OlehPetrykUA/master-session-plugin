import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { BAND, BOARD, BOARD_TOOL, HOME, PANE, SPAWN, COLD_MS, world } from '../testing/world'
import type { Child } from '../testing/world'

const SECONDS = 300
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const ONE = { ...BOARD, sessions: [{ ...BOARD.sessions[0], state: 'working', needsYou: undefined }], needsYou: [], narrative: 'Two workers are running. env-e2e-test needs you to approve a settings edit. Nothing else is pending.' }

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
  svgs: number
  interactive: number
  animatedInteractive: number
  animated: number
  svgChanges: number
}

const ENDLESS = /repeatCount="indefinite"|infinite/

async function surfaces($: Engine, open: boolean) {
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const pane = open ? await $.ui.mount({ ...PANE, surface: 'desktop' }) : undefined
  return [band, ...(pane ? [pane] : [])] as { findAll: typeof band.findAll; unmount: typeof band.unmount }[]
}

async function svgsOf(mounted: Awaited<ReturnType<typeof surfaces>>) {
  const found = new Map<string, { source: string; isInteractive: boolean }>()
  for (const [index, ui] of mounted.entries()) {
    for (const [at, one] of (await ui.findAll({ type: 'Svg' })).entries()) {
      found.set(`${index}:${one.key ?? at}`, { source: String(one.props.source ?? ''), isInteractive: one.props.isInteractive === true })
    }
  }
  return found
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
  const now = (): Omit<Cost, 'svgs' | 'interactive' | 'animatedInteractive' | 'animated' | 'svgChanges'> => ({
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
  const work = (one: ReturnType<typeof now>) => one.render + one.invalidate + one.process + one.mcp + one.read + one.write + one.model
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  if (board) await $.tool.call({ tool: BOARD_TOOL, ...ONE })
  await run.clock.settle()
  const mounted = board ? await surfaces($, open) : []
  for (let index = 0; index < subagents; index += 1) await $.agent.spawn({ ...SPAWN, description: `Docs lookup ${index}`, subagentType: 'Explore' })
  await run.clock.settle()
  const base = now()
  let worked = 0
  let svgChanges = 0
  let last = await svgsOf(mounted)
  for (let second = 0; second < SECONDS; second += 1) {
    const before = now()
    await run.clock.advance(1000)
    const after = now()
    if (after.fired > before.fired && work(after) > work(before)) worked += 1
    const seen = await svgsOf(mounted)
    for (const [key, one] of seen) if (last.has(key) && last.get(key)?.source !== one.source) svgChanges += 1
    last = seen
  }
  const end = now()
  const all = [...last.values()]
  for (const ui of mounted) await ui.unmount()
  return {
    svgs: all.length,
    interactive: all.filter(one => one.isInteractive).length,
    animatedInteractive: all.filter(one => one.isInteractive && ENDLESS.test(one.source)).length,
    animated: all.filter(one => ENDLESS.test(one.source)).length,
    svgChanges,
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
  plain: { fired: 0, worked: 0, render: 0, invalidate: 0, process: 0, mcp: 0, read: 0, write: 0, model: 0, svgs: 0, interactive: 0, animatedInteractive: 0, animated: 0, svgChanges: 0 },
  closed: { fired: 20, worked: 20, render: 5, invalidate: 5, process: 24, mcp: 20, read: 34, write: 0, model: 2, svgs: 3, interactive: 0, animatedInteractive: 0, animated: 0, svgChanges: 0 },
  open: { fired: 380, worked: 108, render: 64, invalidate: 64, process: 122, mcp: 20, read: 139, write: 0, model: 2, svgs: 67, interactive: 0, animatedInteractive: 0, animated: 0, svgChanges: 5 },
}

function within(cost: Cost, bound: Cost) {
  expect(cost).toEqual({ ...cost, ...Object.fromEntries(Object.entries(bound).filter(([key, max]) => cost[key as keyof Cost] > max).map(([key, max]) => [key, `at most ${max}`])) })
}

test('cost: a plain chat that spawns one subagent', { timeoutMs: COLD_MS }, async ($, on) => {
  within(await measured($, on, {}, 1, false, false), BOUNDS.plain)
})

test('cost: a master with the pane closed and two running subagents', { timeoutMs: COLD_MS }, async ($, on) => {
  within(await measured($, on, { isPaneOpen: false }, 2, false, true), BOUNDS.closed)
})

test('cost: a master with the pane open, two running subagents and one board session', { timeoutMs: COLD_MS }, async ($, on) => {
  within(await measured($, on, {}, 2, true, true), BOUNDS.open)
})
