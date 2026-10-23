import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import type { AgentRecord, Report } from '../../types'

import { workflowRunsOf } from '../lib/agents'
import { BOARD, BOARD_TOOL, HOME, MASTER, PANE, SPAWN, warmUp, world } from '../testing/world'
import { merge } from './contract'
import { reportPath } from './status'

const NOW = 3_600_000

const PROBE = {
  name: 'agents-probe',
  register(on: On) {
    on('ui.render', { component: 'Pane', requestId: 'agents-probe' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      const agents = await $.state.get({ plugin: 'master-session', key: 'agents' })
      return <Text>{JSON.stringify(agents.value ?? [])}</Text>
    })
  },
}

async function agentsOf($: Engine) {
  const ui = await $.ui.mount({ ...PANE, plugin: 'agents-probe', requestId: 'agents-probe', surface: 'terminal' })
  const agents = JSON.parse(String((await ui.find({ type: 'Text' }))?.text)) as AgentRecord[]
  await ui.unmount()
  return agents
}

const listing = (...ids: string[]): AgentInfo[] => ids.map(id => ({ id, description: `task ${id}`, type: 'general-purpose', status: 'running' }))

function loops(on: On, ids: string[]) {
  on('agent.list', () => ({ value: listing(...ids) }))
  on('agent.spawn', (_, e) => ({ model: 'claude-haiku-5-5', agentId: e.workflow ? `w${e.workflow.agentIndex}` : e.parentAgentId ? 'a2' : 'a1' }))
  on('classic.PermissionRequest', () => ({}))
  on('classic.Notification', () => ({}))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
}

const askingOf = (agents: AgentRecord[], id: string) => agents.find(one => one.id === id)?.asking

warmUp()

test('a subagent prompt in the master marks that subagent asking with the prompt, its parent loop kept; the answer, a new turn and its end clear it', { plugins: [PROBE] }, async ($, on) => {
  loops(on, ['a1', 'a2'])
  const { clock } = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await $.agent.spawn({ ...SPAWN, description: 'Find callers', subagentType: 'Explore' })
  await $.agent.spawn({ ...SPAWN, description: 'Check one caller', subagentType: 'Explore', parentAgentId: 'a1' })
  expect((await agentsOf($)).map(one => [one.id, one.parentAgentId, one.asking])).toEqual([
    ['a1', undefined, undefined],
    ['a2', 'a1', undefined],
  ])
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, agent_id: 'a2', agent_type: 'Explore' } as never)
  expect([askingOf(await agentsOf($), 'a2'), askingOf(await agentsOf($), 'a1')]).toEqual([{ text: 'Allow Bash: rm -rf build', since: NOW }, undefined])
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' })
  expect(askingOf(await agentsOf($), 'a2')).toEqual({ text: 'Allow Bash: rm -rf build', since: NOW })
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build', agentId: 'a2' })
  expect(askingOf(await agentsOf($), 'a2')).toBeUndefined()
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt', agent_id: 'a1' } as never)
  expect(askingOf(await agentsOf($), 'a1')).toEqual({ text: 'Claude needs your permission', since: NOW })
  await clock.advance(3_000)
  expect(askingOf(await agentsOf($), 'a1')?.text).toBe('Claude needs your permission')
  await $.turn.start({ text: 'go on', turnId: 't2', agentId: 'a1' } as never)
  expect(askingOf(await agentsOf($), 'a1')).toBeUndefined()
  await $.classic.PermissionRequest({ tool_name: 'Edit', tool_input: { file_path: '/repo/a.ts' }, agent_id: 'a1' } as never)
  expect(askingOf(await agentsOf($), 'a1')?.text).toBe('Allow Edit: /repo/a.ts')
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't3', agentId: 'a1', reason: 'answer' })
  const over = (await agentsOf($)).find(one => one.id === 'a1')
  expect([over?.state, over?.asking]).toEqual(['done', undefined])
})

test('a workflow agent prompt shows on that agent and in its run counts, and clears when answered', { plugins: [PROBE] }, async ($, on) => {
  loops(on, [])
  const { clock } = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await $.agent.spawn({ ...SPAWN, description: 'alpha-scan', subagentType: 'workflow-subagent', workflow: { runId: 'wf_7', agentIndex: 1 } })
  await $.agent.spawn({ ...SPAWN, description: 'beta-scan', subagentType: 'workflow-subagent', workflow: { runId: 'wf_7', agentIndex: 2 } })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' }, agent_id: 'w2' } as never)
  await clock.advance(3_000)
  const [run] = workflowRunsOf(await agentsOf($), [])
  expect([run?.counts.asking, run?.agents.map(one => one.asking?.text)]).toEqual([1, [undefined, 'Allow Bash: git push']])
  await $.tool.call({ tool: 'Bash', command: 'git push', agentId: 'w2' })
  expect(workflowRunsOf(await agentsOf($), [])[0]?.counts.asking).toBe(0)
})

test("a subagent prompt in a worker goes into the worker's report agents with its parent loop, its row needs-you while it asks, and clears on the answer", async ($, on) => {
  const written: Report[] = []
  on('fs.write', (_, e) => {
    if (e.path === reportPath(HOME, 'local_worker')) written.push(JSON.parse(e.text) as Report)
    return { value: undefined }
  })
  loops(on, ['a1', 'a2'])
  const { clock } = world(on, { parent: MASTER })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await $.tool.call({ tool: 'mcp__master-session__report', state: 'working', persona: 'Implementer', progress: 'step 2 of 4 — build' })
  await $.agent.spawn({ ...SPAWN, description: 'Find callers', subagentType: 'Explore' })
  await $.agent.spawn({ ...SPAWN, description: 'Check one caller', subagentType: 'Explore', parentAgentId: 'a1' })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, agent_id: 'a2' } as never)
  const asking = written.at(-1)
  expect(asking?.agents).toEqual([
    { id: 'a2', type: 'Explore', description: 'Check one caller', state: 'running', startedAt: NOW, parentAgentId: 'a1', asking: { text: 'Allow Bash: rm -rf build', since: NOW } },
    { id: 'a1', type: 'Explore', description: 'Find callers', state: 'running', startedAt: NOW },
  ])
  const rowOf = (report: Report | undefined) => merge(null, report ? [report] : [], { self: MASTER, title: '', sessions: [], error: '', at: 0 }, NOW).sessions[0]
  expect([rowOf(asking)?.state, rowOf(asking)?.needsYou, rowOf(asking)?.persona]).toEqual(['needs-you', 'Allow Bash: rm -rf build', 'Implementer'])
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build', agentId: 'a2' })
  expect(written.at(-1)?.agents?.some(one => one.asking)).toBe(false)
  expect([rowOf(written.at(-1))?.state, rowOf(written.at(-1))?.needsYou]).toEqual(['waiting', undefined])
})

test("the master merges a worker's reported subagents under that worker within one refresh, asking and cleared", { plugins: [PROBE] }, async ($, on) => {
  const report: Report = {
    v: 1,
    kind: 'status',
    session: 'local_setup',
    engineId: 'engine-setup',
    parent: 'local_validator',
    seq: 5,
    at: NOW - 10_000,
    run: { isRunning: true, since: NOW - 60_000 },
    modelAt: NOW - 10_000,
    state: 'working',
    persona: 'Implementer',
    activity: [],
    commits: [],
    tests: [],
    files: [],
    agents: [{ id: 'a2', type: 'Explore', description: 'Check one caller', state: 'running', startedAt: NOW - 30_000, parentAgentId: 'a1' }],
  }
  const files: Record<string, string> = { [reportPath(HOME, 'local_setup')]: JSON.stringify(report) }
  loops(on, ['a1'])
  const { clock } = world(on, { files })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await $.agent.spawn({ ...SPAWN, description: 'Docs lookup' })
  await clock.advance(3_000)
  expect((await agentsOf($)).map(one => [one.id, one.parentSessionId, one.parentAgentId, one.asking])).toEqual([
    ['a1', undefined, undefined, undefined],
    ['a2', 'local_setup', 'a1', undefined],
  ])
  files[reportPath(HOME, 'local_setup')] = JSON.stringify({ ...report, seq: 6, at: NOW + 1_000, agents: [{ ...report.agents?.[0], asking: { text: 'Allow Bash: rm -rf build', since: NOW + 1_000 } }] })
  await clock.advance(3_000)
  expect(askingOf(await agentsOf($), 'a2')).toEqual({ text: 'Allow Bash: rm -rf build', since: NOW + 1_000 })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ key: 'row-local_setup' }))?.props.borderColor).toBe('error')
  await pane.unmount()
  files[reportPath(HOME, 'local_setup')] = JSON.stringify({ ...report, seq: 7, at: NOW + 4_000 })
  await clock.advance(3_000)
  expect(askingOf(await agentsOf($), 'a2')).toBeUndefined()
  expect((await agentsOf($)).find(one => one.id === 'a1')?.state).toBe('running')
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await after.find({ key: 'row-local_setup' }))?.props.borderColor).not.toBe('error')
  await after.unmount()
})

test("a prompt from an agent the session doesn't track, such as a teammate, turns the worker's own report needs-you and clears on the answer", async ($, on) => {
  const written: Report[] = []
  on('fs.write', (_, e) => {
    if (e.path === reportPath(HOME, 'local_worker')) written.push(JSON.parse(e.text) as Report)
    return { value: undefined }
  })
  loops(on, [])
  const { clock } = world(on, { parent: MASTER })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await $.tool.call({ tool: 'mcp__master-session__report', state: 'working', progress: 'step 2 of 4 — build' })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' }, agent_id: 'tm1' } as never)
  expect([written.at(-1)?.state, written.at(-1)?.needsYou]).toEqual(['needs-you', 'Allow Bash: git push'])
  await $.tool.call({ tool: 'Bash', command: 'git push', agentId: 'tm1' })
  expect([written.at(-1)?.state, written.at(-1)?.needsYou]).toEqual(['working', undefined])
})

test("a tracked subagent's finished tool call never closes the worker's own open prompt, only the session's own answer does", async ($, on) => {
  const written: Report[] = []
  on('fs.write', (_, e) => {
    if (e.path === reportPath(HOME, 'local_worker')) written.push(JSON.parse(e.text) as Report)
    return { value: undefined }
  })
  loops(on, ['a1'])
  const { clock } = world(on, { parent: MASTER })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await $.tool.call({ tool: 'mcp__master-session__report', state: 'working', progress: 'step 2 of 4 — build' })
  await $.agent.spawn({ ...SPAWN, description: 'Find callers', subagentType: 'Explore' })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' } })
  expect([written.at(-1)?.state, written.at(-1)?.needsYou]).toEqual(['needs-you', 'Allow Bash: git push'])
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' })
  expect([written.at(-1)?.state, written.at(-1)?.needsYou]).toEqual(['needs-you', 'Allow Bash: git push'])
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect([written.at(-1)?.state, written.at(-1)?.needsYou]).toEqual(['working', undefined])
})

test("a session prompt stays open through an untracked agent's same-named tool, and a teammate's prompt stays open through the session's own", async ($, on) => {
  const written: Report[] = []
  on('fs.write', (_, e) => {
    if (e.path === reportPath(HOME, 'local_worker')) written.push(JSON.parse(e.text) as Report)
    return { value: undefined }
  })
  loops(on, [])
  const { clock } = world(on, { parent: MASTER })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await $.tool.call({ tool: 'mcp__master-session__report', state: 'working', progress: 'step 2 of 4 — build' })
  const last = () => [written.at(-1)?.state, written.at(-1)?.needsYou]
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' } })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'tm1' })
  expect(last()).toEqual(['needs-you', 'Allow Bash: git push'])
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(last()).toEqual(['working', undefined])
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, agent_id: 'tm1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(last()).toEqual(['needs-you', 'Allow Bash: rm -rf build'])
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build', agentId: 'tm1' })
  expect(last()).toEqual(['working', undefined])
})

test("an untracked agent's prompt clears when that agent's turn starts, ends or is aborted, and a main-thread answer never clears it", async ($, on) => {
  const written: Report[] = []
  on('fs.write', (_, e) => {
    if (e.path === reportPath(HOME, 'local_worker')) written.push(JSON.parse(e.text) as Report)
    return { value: undefined }
  })
  loops(on, [])
  const { clock } = world(on, { parent: MASTER })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await $.tool.call({ tool: 'mcp__master-session__report', state: 'working', progress: 'step 2 of 4 — build' })
  const last = () => [written.at(-1)?.state, written.at(-1)?.needsYou]
  const ask = () => $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt', agent_id: 'tm1' } as never)
  const asking = ['needs-you', 'Claude needs your permission']
  await ask()
  expect(last()).toEqual(asking)
  await $.turn.start({ text: 'go on', turnId: 'm1', agentId: 'tm1' } as never)
  expect(last()).toEqual(['working', undefined])
  await ask()
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 'm2', agentId: 'tm1', reason: 'answer' })
  expect(last()).toEqual(['working', undefined])
  await ask()
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: true, turnId: 'm3', agentId: 'tm1', reason: 'aborted' } as never)
  expect(last()).toEqual(['working', undefined])
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' }, agent_id: 'tm1' } as never)
  await $.classic.Notification({ message: 'done', notification_type: 'elicitation_response' })
  expect(last()).toEqual(['needs-you', 'Allow Bash: git push'])
  await $.tool.call({ tool: 'Bash', command: 'git push', agentId: 'tm1' })
  expect(last()).toEqual(['working', undefined])
})
