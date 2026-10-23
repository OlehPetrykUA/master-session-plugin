import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { On } from 'claude-code'

import type { AgentRecord, WorkflowRecord } from '../types'

import { subagentsOf, workflowRunsOf } from './lib/agents'
import type { Child } from './testing/world'
import { BOARD, BOARD_TOOL, HOME, PANE, SELF, SPAWN, click, started, textsOf, typed, warmUp, world } from './testing/world'

warmUp()

const PLUGIN_ORIGIN = { kind: 'plugin', name: 'master-session' }

test('/master-session:start status opens the pane; with a task it also runs the skill', async ($, on) => {
  const { opened, ran, clock } = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect((await $.command.run(typed('master-session:start', 'status'))).text).toBe('Master session pane opened.')
  expect(ran).toEqual([])
  expect((await $.command.run(typed('master-session:start', 'fix the hooks'))).text).toBe('skill ran')
  expect(ran).toEqual(['master-session:start fix the hooks'])
  expect((await $.command.run(typed('start', 'status'))).text).toBe('skill ran')
  expect(opened).toEqual(['master-session'])
})

test('/master-session:info opens the pane without running its skill, and ask asks the workers', async ($, on) => {
  const { opened, ran, calls } = await started($, on)
  expect((await $.command.run(typed('master-session:info', ''))).text).toBe('Master session pane opened.')
  expect(opened).toEqual(['master-session'])
  expect((await $.command.run(typed('master-session:info', 'ask'))).text).toBe('Asked 1 running worker · 1 idle skipped')
  expect(calls.filter(one => one.tool === 'send_message').map(one => one.args.session_id)).toEqual(['local_env'])
  expect(opened).toEqual(['master-session'])
  expect(ran).toEqual([])
})

test('/master-session:info ask with no board has no one to ask and sends nothing', async ($, on) => {
  const { calls, clock } = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect((await $.command.run(typed('master-session:info', 'ask'))).text).toBe('No running workers to ask')
  expect(calls.some(one => one.tool === 'send_message')).toBe(false)
})

test('the skill prompt says the pane is on and points at the board tool', async ($, on) => {
  const { clock } = world(on)
  on('skill.prompt', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const plugin = await $.skill.prompt({ skill: 'master-session:start', text: 'Validator mode.', frontmatter: {}, source: 'plugin' })
  expect(plugin.text).toContain('Status pane: on. Publish every board with the mcp__master-session__board tool')
  const bare = await $.skill.prompt({ skill: 'start', text: 'Start.', frontmatter: {}, source: 'userSettings' })
  expect(bare.text).toBe('Start.')
  const other = await $.skill.prompt({ skill: 'commit', text: 'Commit.', frontmatter: {}, source: 'userSettings' })
  expect(other.text).toBe('Commit.')
})

test('the scroll tool moves the desktop pane to every drawn section and refuses the others', async ($, on) => {
  const landed: number[] = []
  on('ui.scroll', ((_: unknown, e: { offset: number }) => {
    landed.push(e.offset)
    return { value: {} }
  }) as never)
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const raise = $.ui as unknown as { scroll: (input: unknown) => Promise<unknown> }
  const move = async (to: string) => {
    const answer = (await $.tool.call({ tool: 'mcp__master-session__scroll', to })) as { result?: string; deny?: string }
    const text = String(answer.result ?? answer.deny)
    const row = Number(/\(row (\d+)\)/.exec(text)?.[1] ?? -1)
    expect(text).toBe(`Not scrolled (row ${row}): no implementation for ui.scroll`)
    landed.length = 0
    await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 0, by: 0, bodyRows: 20, contentRows: 400, origin: PLUGIN_ORIGIN })
    expect(landed).toEqual([row])
    return row
  }
  expect(String(((await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'nowhere' })) as { deny?: string }).deny)).toContain('section-list')
  const header = await move('section-header')
  const summary = await move('section-summary')
  const chips = await move('section-chips')
  const tiles = await move('section-list')
  const archived = await move('section-archived')
  expect(header).toBe(0)
  expect(summary).toBe(0)
  expect(chips).toBeGreaterThan(summary)
  expect(tiles).toBeGreaterThan(chips)
  expect(archived).toBeGreaterThan(tiles)
  const answer = (await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'section-expanded' })) as { deny?: string }
  expect(String(answer.deny)).toContain('section-expanded is not drawn')
  await click(ui, 'hit-row-local_env')
  expect(await move('section-expanded')).toBe(tiles)
  await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 7, by: 7, bodyRows: 20, contentRows: 400, origin: PLUGIN_ORIGIN })
  expect(landed.at(-1)).toBe(7)
  const asked = await move('section-list')
  await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'section-list' })
  landed.length = 0
  await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 0, by: 0, bodyRows: 20, contentRows: 22, origin: PLUGIN_ORIGIN })
  expect(landed).toEqual([asked])
  await ui.unmount()
})

test('a person scroll passes through the pane hook untouched', async ($, on) => {
  const offsets: number[] = []
  on('ui.scroll', ((_: unknown, e: { offset: number }) => {
    offsets.push(e.offset)
    return { value: {} }
  }) as never)
  await started($, on)
  await $.ui.mount({ ...PANE, surface: 'desktop' })
  const raise = $.ui as unknown as { scroll: (input: unknown) => Promise<unknown> }
  await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 3, by: 3, bodyRows: 20, contentRows: 80, origin: { kind: 'person' } })
  expect(offsets).toEqual([3])
})

const STATE_PROBE = {
  name: 'state-probe',
  register(on: On) {
    on('ui.render', { component: 'Pane', requestId: 'state-probe' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      const agents = await $.state.get({ plugin: 'master-session', key: 'agents' })
      const workflows = await $.state.get({ plugin: 'master-session', key: 'workflows' })
      return <Text>{JSON.stringify({ agents: agents.value ?? [], workflows: workflows.value ?? [] })}</Text>
    })
  },
}

test('agent spawns, their ends and a Workflow launch reach the agents and workflows atoms through the hooks', { plugins: [STATE_PROBE] }, async ($, on) => {
  const launch = { status: 'async_launched' as const, taskId: 'wi5', taskType: 'local_workflow' as const, workflowName: 'probe-run', runId: 'wf_7', summary: 'Probe the spawn event' }
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', (_, e) => ({ model: 'claude-haiku-5-5', agentId: e.workflow ? `w${e.workflow.agentIndex}` : 'a1' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Workflow' }, () => ({ result: launch, text: 'Workflow launched in background.' }))
  const { clock } = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const answer = await $.tool.call({ tool: 'Workflow', script: "export const meta = { name: 'probe-run', phases: [{ title: 'Scan' }, { title: 'Check' }] }" })
  expect(answer).toEqual(expect.objectContaining({ result: launch }))
  await $.agent.spawn({ ...SPAWN, description: 'alpha-scan', subagentType: 'workflow-subagent', model: 'haiku', background: false, workflow: { runId: 'wf_7', agentIndex: 1 } })
  await $.agent.spawn({ ...SPAWN, name: 'probe-helper', description: 'Say gamma', subagentType: 'general-purpose' })
  await $.turn.complete({ answer: 'alpha', durationMs: 5, isAborted: false, turnId: 'u1', agentId: 'w1', reason: 'answer' })
  const ui = await $.ui.mount({ ...PANE, plugin: 'state-probe', requestId: 'state-probe', surface: 'terminal' })
  const state = JSON.parse(String((await ui.find({ type: 'Text' }))?.text)) as { agents: AgentRecord[]; workflows: WorkflowRecord[] }
  await ui.unmount()
  expect(state.agents.map(agent => [agent.id, agent.name, agent.type, agent.description, agent.model, agent.run, agent.state])).toEqual([
    ['w1', undefined, 'workflow-subagent', 'alpha-scan', 'claude-haiku-5-5', { id: 'wf_7', index: 1 }, 'done'],
    ['a1', 'probe-helper', 'general-purpose', 'Say gamma', 'claude-haiku-5-5', undefined, 'running'],
  ])
  expect(state.workflows).toEqual([expect.objectContaining({ id: 'wf_7', name: 'probe-run', description: 'Probe the spawn event', taskId: 'wi5', phases: ['Scan', 'Check'] })])
  const runs = workflowRunsOf(state.agents, state.workflows)
  expect([runs.length, subagentsOf(state.agents).map(agent => agent.id)]).toEqual([1, ['a1']])
})

test('the open tool can expand one card and open the Archived list, so a check can see every card without clicks', async ($, on) => {
  const { opened } = await started($, on)
  const expanded = (await $.tool.call({ tool: 'mcp__master-session__open', expand: 'local_setup' })) as { result?: string }
  expect(expanded.result).toBe('The master session pane is open beside the chat, showing local_setup expanded.')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  await ui.unmount()
  const archived = (await $.tool.call({ tool: 'mcp__master-session__open', archived: true, expand: 'local_old' })) as { result?: string }
  expect(archived.result).toBe('The master session pane is open beside the chat, showing the Archived list with local_old expanded.')
  const list = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await list.find({ key: 'detail-local_setup' })).toBeUndefined()
  expect(await textsOf(list)).toEqual(expect.arrayContaining(['Archived', 'Remove the stale mod']))
  expect(await list.find({ key: 'group-head-waiting' })).toBeUndefined()
  await list.unmount()
  const missing = (await $.tool.call({ tool: 'mcp__master-session__open', expand: 'nope' })) as { result?: string }
  expect(missing.result).toBe('The master session pane is open beside the chat. nope was not found among its items.')
  const hidden = (await $.tool.call({ tool: 'mcp__master-session__open', expand: 'local_old' })) as { result?: string }
  expect(hidden.result).toBe('The master session pane is open beside the chat. local_old was not found among its items; it is archived, so pass archived: true.')
  const live = (await $.tool.call({ tool: 'mcp__master-session__open', archived: true, expand: 'local_setup' })) as { result?: string }
  expect(live.result).toBe('The master session pane is open beside the chat, showing the Archived list. local_setup was not found among its items.')
  const plain = (await $.tool.call({ tool: 'mcp__master-session__open' })) as { result?: string }
  expect(plain.result).toBe('The master session pane is open beside the chat.')
  expect(opened.length).toBeGreaterThanOrEqual(3)
})

test('the master republishes a merged board with its reports and repos when a worker reports', async ($, on) => {
  const writes = new Map<string, string>()
  on('fs.write', (_, e) => {
    writes.set(e.path, e.text)
    return { value: undefined }
  })
  const files: Record<string, string> = {}
  const run = world(on, { files })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await run.clock.settle()
  const path = `${HOME}/.claude/state/master-session/boards/${SELF}.json`
  const first = JSON.parse(writes.get(path) ?? '{}')
  expect(first.board.sessions.find((one: { id: string }) => one.id === 'local_setup').state).toBe('waiting')
  const report = JSON.stringify({ v: 1, kind: 'status', session: 'local_setup', parent: SELF, seq: 1, at: 3_700_000, modelAt: 3_700_000, state: 'done', commits: [{ sha: 'abc1234', subject: 'fix' }], run: { isRunning: false } })
  files[`${HOME}/.claude/state/master-session/sessions/local_setup.json`] = report
  await run.clock.advance(9_000)
  const second = JSON.parse(writes.get(path) ?? '{}')
  const row = second.board.sessions.find((one: { id: string }) => one.id === 'local_setup')
  expect(row.state).toBe('done')
  expect(row.commits).toEqual(['abc1234 fix'])
})

async function landedAfterOpen($: Engine, on: On, child: Child) {
  const landed: number[] = []
  on('ui.scroll', ((_: unknown, e: { offset: number }) => {
    landed.push(e.offset)
    return { value: {} }
  }) as never)
  const run = await started($, on, BOARD, child)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await $.tool.call({ tool: 'mcp__master-session__open', expand: 'local_setup' })
  await run.clock.settle()
  const raise = $.ui as unknown as { scroll: (input: unknown) => Promise<unknown> }
  await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 0, by: 0, bodyRows: 20, contentRows: 400, origin: PLUGIN_ORIGIN })
  await ui.unmount()
  return { landed, run }
}

test('opening the pane aims the next plugin scroll at the expanded card', async ($, on) => {
  const { landed } = await landedAfterOpen($, on, {})
  expect(landed.length).toBe(1)
  expect(landed[0]).toBeGreaterThan(0)
})

test('a hidden pane stays hidden: the scroll tool refuses, no aim is kept and ticks never reopen it', async ($, on) => {
  const { landed, run } = await landedAfterOpen($, on, { isPaneHidden: true })
  const scrolled = (await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'start' })) as { deny?: string }
  expect(scrolled.deny).toBe('Not scrolled: the pane is hidden; open it first.')
  const opened = run.opened.length
  await run.clock.advance(60_000)
  await run.clock.settle()
  expect(run.opened.length).toBe(opened)
  expect(run.opened).toContain('master-session')
  expect(landed).toEqual([0])
})

test('a pane that is open but not placed yet counts as closed: the scroll tool refuses and no aim is kept', async ($, on) => {
  const { landed, run } = await landedAfterOpen($, on, { isPlaced: false })
  expect(landed).toEqual([0])
  const scrolled = (await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'start' })) as { deny?: string }
  expect(scrolled.deny).toBe('Not scrolled: the pane is hidden; open it first.')
  expect(run.opened).toEqual(['master-session'])
})

test('the open tool says to post the board in chat when no surface draws the pane', async ($, on) => {
  await started($, on, BOARD, { isPlaced: false })
  const answer = (await $.tool.call({ tool: 'mcp__master-session__open' })) as { result?: string }
  expect(answer.result).toBe('The pane is open, but no attached surface draws it: post the board in chat.')
})

test('the board tool says to post the board in chat when no surface is attached', async ($, on) => {
  const { answer } = await started($, on, BOARD, { surfaces: [] })
  expect((answer as { result?: string }).result).toBe('Board updated, but no surface is attached to draw it: post the board in chat.')
})

test('the board tool with a surface counts the sessions it published', async ($, on) => {
  const { answer } = await started($, on)
  expect((answer as { result?: string }).result).toBe('Board updated: 2 sessions in the pane and the band. Post only 🔴 needs-you lines in chat.')
})

test('a malformed board is refused with what it needs and changes nothing', async ($, on) => {
  const { clock } = await started($, on)
  await clock.settle()
  for (const board of [{}, { tick: '10:00' }, { sessions: [{ id: 'x' }] }, { sessions: [{ id: 'local_env', state: 'working' }, { state: 'working' }] }]) {
    const answer = (await $.tool.call({ tool: BOARD_TOOL, ...board })) as { deny?: string }
    expect(answer.deny).toBe('The board needs a sessions array whose items carry id and state.')
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'hit-row-local_env' })).toBeDefined()
  await ui.unmount()
})
