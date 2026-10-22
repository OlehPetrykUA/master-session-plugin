import { expect, test } from 'claude-code/testing'

import type { On } from 'claude-code'

import type { AgentRecord, WorkflowRecord } from '../types'

import { subagentsOf, workflowRunsOf } from './lib/agents'
import { BAND, HOME, PANE, SPAWN, altsOf, childOf, click, started, textsOf, typed, world } from './testing/world'

test('/master-session:start status opens the pane; with a task it also runs the skill', async ($, on) => {
  const { opened, ran, clock } = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect((await $.command.run(typed('master-session:start', 'status'))).text).toBe('Master session pane opened.')
  expect(ran).toEqual([])
  expect((await $.command.run(typed('master-session:start', 'fix the hooks'))).text).toBe('skill ran')
  expect(ran).toEqual(['master-session:start fix the hooks'])
  expect((await $.command.run(typed('start', 'status'))).text).toBe('skill ran')
  expect(opened).toEqual(['master-session', 'master-session'])
})

test('/master-session:info opens the pane without running its skill, and ask asks the workers', async ($, on) => {
  const { opened, ran, clock } = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect((await $.command.run(typed('master-session:info', ''))).text).toBe('Master session pane opened.')
  expect(opened).toEqual(['master-session'])
  expect((await $.command.run(typed('master-session:info', 'ask'))).text).toMatch(/^No running workers to ask|^Asked \d+ running worker/)
  expect(opened).toEqual(['master-session'])
  expect(ran).toEqual([])
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

test('a master board older than 30 minutes is ignored', async ($, on) => {
  const run = world(on, childOf(0))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(3_000)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await altsOf(band)).toEqual([])
  expect((await band.find({ type: 'Text', text: 'engine' }))?.text).toBe('engine')
  await band.unmount()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textsOf(ui)).not.toContain('from Orbit Agents Toolkit Validator')
  await ui.unmount()
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
    await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 0, by: 0, bodyRows: 20, contentRows: 400, origin: { kind: 'plugin', name: 'master-session' } })
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
  await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 7, by: 7, bodyRows: 20, contentRows: 400, origin: { kind: 'plugin', name: 'master-session' } })
  expect(landed.at(-1)).toBe(7)
  const asked = await move('section-list')
  await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'section-list' })
  landed.length = 0
  await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 0, by: 0, bodyRows: 20, contentRows: 22, origin: { kind: 'plugin', name: 'master-session' } })
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
  const plain = (await $.tool.call({ tool: 'mcp__master-session__open' })) as { result?: string }
  expect(plain.result).toBe('The master session pane is open beside the chat.')
  expect(opened.length).toBeGreaterThanOrEqual(3)
})
