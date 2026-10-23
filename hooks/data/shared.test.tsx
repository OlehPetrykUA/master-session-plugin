import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRecord } from '../../types'
import { BAND, BOARD, BOARD_TOOL, HOME, PANE, SELF, SPAWN, TOOLKIT, altsOf, childOf, textsOf, warmUp, world } from '../testing/world'

warmUp()

const CALM = { ...BOARD, sessions: BOARD.sessions.map(one => ({ ...one, state: 'working' as const, needsYou: undefined })), needsYou: [] }

const BOARD_FILE = `${HOME}/.claude/state/master-session/boards/${SELF}.json`

const agentOf = (id: string, state: AgentRecord['state'], startedAt: number): AgentRecord => ({ id, name: id, type: 'general-purpose', description: id, state, startedAt })

function capture($on: On) {
  const writes: string[] = []
  $on('fs.write', (_, e) => {
    if (e.path === BOARD_FILE) writes.push(e.text)
    return { value: undefined }
  })
  return writes
}

async function master($: Engine, on: On) {
  const writes = capture(on)
  const alive = new Set<string>()
  on('agent.list', () => ({ value: [...alive].map(id => ({ id, name: id, type: 'general-purpose', description: id, status: 'running' as const })) as never }))
  let next = 0
  on('agent.spawn', () => {
    const agentId = `a${++next}`
    alive.add(agentId)
    return { model: 'claude-haiku-5-5', agentId }
  })
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await run.clock.settle()
  return { writes, clock: run.clock, alive }
}

const lastOf = (writes: string[]) => JSON.parse(writes.at(-1) ?? '{}') as { agents?: AgentRecord[] }

test('the master rewrites the shared file when a subagent starts and again when it ends', async ($, on) => {
  const { writes, clock, alive } = await master($, on)
  const before = writes.length
  expect((JSON.parse(writes.at(-1) ?? '{}') as { board?: { since?: number } }).board?.since).toBeGreaterThan(0)
  await $.agent.spawn({ ...SPAWN, name: 'helper', description: 'help', subagentType: 'general-purpose' })
  await clock.advance(9_000)
  expect(writes.length).toBeGreaterThan(before)
  expect(lastOf(writes).agents?.map(one => [one.id, one.state])).toEqual([['a1', 'running']])
  alive.delete('a1')
  await clock.advance(9_000)
  expect(lastOf(writes).agents?.map(one => [one.id, one.state])).toEqual([['a1', 'done']])
})

test('unchanged ticks write nothing and one change writes exactly once', async ($, on) => {
  const { writes, clock } = await master($, on)
  await clock.advance(9_000)
  const settled = writes.length
  await clock.advance(120_000)
  expect(writes.length).toBe(settled)
  await $.agent.spawn({ ...SPAWN, name: 'helper', description: 'help', subagentType: 'general-purpose' })
  await clock.advance(60_000)
  expect(writes.length).toBe(settled + 1)
})

test('running agents are kept before finished ones when the shared list is capped at 40', async ($, on) => {
  const { writes, clock, alive } = await master($, on)
  for (let index = 0; index < 45; index += 1) await $.agent.spawn({ ...SPAWN, name: `n${index}`, description: `d${index}`, subagentType: 'general-purpose' })
  for (let index = 1; index <= 44; index += 1) alive.delete(`a${index}`)
  await clock.advance(9_000)
  const agents = lastOf(writes).agents ?? []
  expect(agents.length).toBe(40)
  expect(agents[0]?.id).toBe('a45')
  expect(agents[0]?.state).toBe('running')
})

async function worker($: Engine, on: On, agents: AgentRecord[]) {
  const child = childOf(3_600_000, CALM)
  const files = child.files ?? {}
  const path = Object.keys(files)[0] ?? ''
  const put = (list: AgentRecord[], at: number) => {
    files[path] = JSON.stringify({ v: 1, kind: 'board', at, masterId: 'local_master', masterTitle: 'M', board: CALM, agents: list })
  }
  put(agents, 3_600_000)
  const run = world(on, child)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(3_000)
  return { clock: run.clock, put, files, path }
}

test('a worker band and pane count the master subagents and follow a start and an end', async ($, on) => {
  const { clock, put } = await worker($, on, [agentOf('m1', 'running', 1), agentOf('m2', 'running', 2), agentOf('m3', 'done', 3), { ...agentOf('w1', 'running', 4), type: 'workflow-subagent', run: { id: 'wf1', index: 0 } }])
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await altsOf(band)).join()).toContain('2 subagents')
  expect((await altsOf(band)).join()).toContain('1 workflow')
  const texts = await textsOf(ui)
  expect(texts.slice(texts.indexOf('Subagents') - 1, texts.indexOf('Subagents') + 2)).toContain('2 running')
  put([agentOf('m1', 'done', 1), agentOf('m2', 'running', 2)], 3_650_000)
  await clock.advance(6_000)
  expect((await altsOf(band)).join()).toContain('1 subagent')
  expect((await altsOf(band)).join()).not.toContain('2 subagents')
  expect(await textsOf(ui)).toContain('1 running')
  await band.unmount()
  await ui.unmount()
})

test('a torn write over a good board keeps the last good copy, and the next good write recovers', async ($, on) => {
  const { clock, put, files, path } = await worker($, on, [agentOf('m1', 'running', 1)])
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await altsOf(band)).join()).toContain('1 subagent')
  const good = files[path] ?? ''
  files[path] = good.slice(0, good.length - 20)
  await clock.advance(6_000)
  expect((await altsOf(band)).join()).toContain('1 subagent')
  put([agentOf('m1', 'running', 1), agentOf('m2', 'running', 2)], 3_650_000)
  await clock.advance(6_000)
  expect((await altsOf(band)).join()).toContain('2 subagents')
  await band.unmount()
})

test('a worker that becomes a master drops the stale shared copy of its old master', async ($, on) => {
  const { clock } = await worker($, on, [agentOf('m1', 'running', 1)])
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await altsOf(band)).join()).toContain('1 subagent')
  await $.tool.call({ tool: BOARD_TOOL, ...CALM })
  await clock.advance(6_000)
  expect((await altsOf(band)).join()).not.toContain('subagent')
  await band.unmount()
})

test('a worker Duration tile starts at the master board since, not at its own rows', async ($, on) => {
  const { clock, files, path } = await worker($, on, [])
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const sinceOf = async () => (await textsOf(ui)).find(one => one.startsWith('since '))
  const own = await sinceOf()
  files[path] = JSON.stringify({ v: 1, kind: 'board', at: 3_650_000, masterId: 'local_master', masterTitle: 'M', board: { ...CALM, since: 0 } })
  await clock.advance(6_000)
  expect(own).toBeDefined()
  expect(await sinceOf()).toBeDefined()
  expect(await sinceOf()).not.toBe(own)
  await ui.unmount()
})

test('a family session missing from the worker live still reads merged to the base when its sha is on it', async ($, on) => {
  const child = childOf(3_600_000, { ...CALM, sessions: [{ id: 'local_far', name: 'Impl', state: 'done', sha: '9bd146c', cwd: TOOLKIT }] })
  const run = world(on, { ...child, git: { [`${TOOLKIT} worktree`]: `worktree ${TOOLKIT}\nHEAD d575596be1713c300bf1d8737355ceda0cb3ded3\nbranch refs/heads/main\n\n`, [`${TOOLKIT} rev-parse`]: 'd575596\n', [`${TOOLKIT} merge-base --is-ancestor 9bd146c refs/heads/main`]: 'ok' } })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(6_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textsOf(ui)).toContain('merged to main')
  await ui.unmount()
})

test('a master workflow record with no agents shows by name, running, in the worker pane and band', async ($, on) => {
  const child = childOf(3_600_000, CALM)
  const files = child.files ?? {}
  const path = Object.keys(files)[0] ?? ''
  files[path] = JSON.stringify({ v: 1, kind: 'board', at: 3_600_000, masterId: 'local_master', masterTitle: 'M', board: CALM, agents: [], workflows: [{ id: 'wf2', toolUseId: '', name: 'scan', phases: ['A', 'B'], startedAt: 1 }] })
  const run = world(on, child)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(3_000)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await altsOf(band)).join()).toContain('1 workflow')
  expect((await textsOf(ui)).join('|')).toContain('scan')
  await band.unmount()
  await ui.unmount()
})
