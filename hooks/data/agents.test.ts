import { expect, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import type { AgentRecord } from '../../types'

import { workflowRunsOf } from '../lib/agents'
import { SPAWN } from '../testing/world'
import { ended, launched, listed, phasesOf, spawned, tokensOf } from './agents'

const NOW = 1_000_000

const RUNNING: AgentRecord = { id: 'a1', type: 'Explore', description: 'Find callers', state: 'running', startedAt: NOW }

const FLOW = { ...SPAWN, description: 'alpha-scan', subagentType: 'workflow-subagent', model: 'haiku', background: false, workflow: { runId: 'wf_9', agentIndex: 2 } }

const LAUNCH = { status: 'async_launched', taskId: 'wi5ozd7sn', taskType: 'local_workflow', workflowName: 'probe-run', runId: 'wf_9', summary: 'Probe the spawn event' }

const info = (id: string, status: AgentInfo['status'], extra: Partial<AgentInfo> = {}): AgentInfo => ({ id, description: `task ${id}`, type: 'general-purpose', status, ...extra })

test('a started spawn records its proper names: name, type, task, model and background; a workflow agent links to its run', () => {
  expect(spawned([], { ...SPAWN, name: 'probe-helper' }, { model: 'claude-sonnet-5-5', agentId: 'a7' }, NOW)).toEqual([
    { id: 'a7', name: 'probe-helper', type: 'master-session:researcher', description: 'Docs lookup', model: 'claude-sonnet-5-5', requestedModel: undefined, parentModel: 'claude-opus-5-5', prompt: 'Read the docs.', isBackground: true, isFork: false, spawnedBy: undefined, run: undefined, state: 'running', startedAt: NOW, tokens: undefined },
  ])
  const [flow] = spawned([], FLOW, { model: 'claude-haiku-5-5', agentId: 'w2' }, NOW)
  expect([flow?.description, flow?.type, flow?.model, flow?.run]).toEqual(['alpha-scan', 'workflow-subagent', 'claude-haiku-5-5', { id: 'wf_9', index: 2 }])
})

test('a denied spawn, a teammate and a spawn with no id add no record; a resume revives the record and keeps its start', () => {
  expect(spawned([RUNNING], SPAWN, { deny: 'no' }, NOW)).toEqual([RUNNING])
  expect(spawned([RUNNING], { ...SPAWN, isTeammate: true }, { model: 'm', agentId: 'mate' }, NOW)).toEqual([RUNNING])
  expect(spawned([RUNNING], SPAWN, { model: 'm' }, NOW)).toEqual([RUNNING])
  const over = { ...RUNNING, state: 'done' as const, endedAt: NOW + 5 }
  const [revived] = spawned([over], { ...SPAWN, resume: { agentId: 'a1' } }, { model: 'm', agentId: 'a1' }, NOW + 9)
  expect([revived?.state, revived?.startedAt, revived?.endedAt]).toEqual(['running', NOW, undefined])
})

test("an agent's turn end marks it done, or failed when the turn did not answer; other records stay", () => {
  const two = [RUNNING, { ...RUNNING, id: 'a2' }]
  expect(ended(two, 'a1', true, NOW + 60_000).map(one => [one.id, one.state, one.endedAt])).toEqual([
    ['a1', 'done', NOW + 60_000],
    ['a2', 'running', undefined],
  ])
  expect(ended(two, 'a2', false, NOW)[1]?.state).toBe('failed')
  const over = ended(two, 'a1', true, NOW)
  expect(ended(over, 'a1', false, NOW + 1)).toEqual(over)
  expect(ended(two, 'nobody', true, NOW)).toEqual(two)
})

test('the list ends subagents it reports over or no longer lists, adds unseen running ones, and leaves workflow agents alone', () => {
  const rows: AgentRecord[] = [RUNNING, { ...RUNNING, id: 'a2' }, { ...RUNNING, id: 'a3' }, { ...RUNNING, id: 'w1', run: { id: 'wf_1', index: 1 } }, { ...RUNNING, id: 'a4' }]
  const infos = [info('a1', 'running'), info('a2', 'completed'), info('a4', 'killed'), info('fork', 'running', { name: 'helper' }), info('old', 'completed'), info('mate', 'running', { teammateId: 'mate@team' })]
  expect(listed(rows, infos, NOW + 1).map(one => [one.id, one.state])).toEqual([
    ['a1', 'running'],
    ['a2', 'done'],
    ['a3', 'done'],
    ['w1', 'running'],
    ['a4', 'failed'],
    ['fork', 'running'],
  ])
  expect(listed(rows, infos, NOW + 1).at(-1)).toEqual({ id: 'fork', name: 'helper', type: 'general-purpose', description: 'task fork', state: 'running', startedAt: NOW + 1 })
  expect(listed([], [], NOW)).toEqual([])
})

test('a local Workflow launch records its run id, name, description, task and phases; remote or odd results record nothing', () => {
  const [run] = launched([], 'toolu_wf', LAUNCH, ['Scan', 'Check'], NOW)
  expect(run).toEqual({ id: 'wf_9', toolUseId: 'toolu_wf', taskId: 'wi5ozd7sn', name: 'probe-run', description: 'Probe the spawn event', phases: ['Scan', 'Check'], startedAt: NOW })
  expect(launched([run!], 'toolu_again', LAUNCH, [], NOW + 50)[0]).toEqual({ ...run, toolUseId: 'toolu_again', phases: [] })
  for (const odd of [undefined, null, 'text', { ...LAUNCH, status: 'remote_launched' }, { status: 'async_launched' }]) expect(launched([], 'toolu_wf', odd, [], NOW)).toEqual([])
})

test("phases are the titles of the script meta's phases, in order; quotes, brackets in strings, a meta title and a body phase() are no phases", () => {
  const script = [
    "export const meta = {",
    "  name: 'probe-run',",
    "  title: 'Not a phase',",
    `  phases: [{ title: 'Scan [fast]' }, { title: "Check", detail: 'title: no' }, { title: \`Ship's\` }],`,
    "}",
    "phase('Late')",
    "const x = { phases: [{ title: 'Body' }] }",
  ].join('\n')
  expect(phasesOf(script)).toEqual(['Scan [fast]', 'Check', "Ship's"])
  expect(phasesOf("export const meta = { name: 'a', phases: [{ title: 'It\\'s' }] }")).toEqual(["It's"])
  expect(phasesOf("export const meta = { name: 'no phases' }\nconst y = { phases: [{ title: 'Body' }] }")).toEqual([])
  expect(phasesOf('const meta = 1')).toEqual([])
  expect(phasesOf('')).toEqual([])
})

test('the live event sequence of one workflow run, as engine 2.1.304 raised it, yields one named run with labelled agents', () => {
  const toolUseId = 'toolu_013K1nodVUdZrS3HQiLS37Zn'
  const runs = launched([], toolUseId, { ...LAUNCH, runId: 'wf_2dcad7c6-ccb' }, phasesOf("export const meta = { name: 'probe-run', description: 'Probe the spawn event', phases: [{ title: 'Scan' }, { title: 'Check' }] }"), NOW)
  const spawn = (index: number, label: string) => ({ ...SPAWN, tool_use_id: toolUseId, description: label, subagentType: 'workflow-subagent', model: 'haiku', background: false, workflow: { runId: 'wf_2dcad7c6-ccb', agentIndex: index } })
  let agents = spawned([], spawn(1, 'alpha-scan'), { model: 'claude-haiku-5-5', agentId: 'a478cde33405f7802' }, NOW + 1)
  agents = ended(agents, 'a478cde33405f7802', true, NOW + 4)
  agents = spawned(agents, spawn(2, 'beta-check'), { model: 'claude-haiku-5-5', agentId: 'a544556d9d5e98937' }, NOW + 5)
  agents = spawned(agents, { ...SPAWN, name: 'probe-helper', description: 'Say gamma', subagentType: 'general-purpose', model: 'haiku', background: false }, { model: 'claude-haiku-5-5', agentId: 'ac4722447cd2102ce' }, NOW + 9)
  agents = listed(agents, [], NOW + 10)
  const [run] = workflowRunsOf(agents, runs)
  expect([run?.name, run?.description, run?.taskId, run?.phases, run?.state, run?.agents.map(agent => [agent.index, agent.label, agent.state])]).toEqual([
    'probe-run',
    'Probe the spawn event',
    'wi5ozd7sn',
    ['Scan', 'Check'],
    'running',
    [
      [1, 'alpha-scan', 'done'],
      [2, 'beta-check', 'running'],
    ],
  ])
  expect(agents.find(agent => agent.id === 'ac4722447cd2102ce')).toEqual(expect.objectContaining({ name: 'probe-helper', state: 'done', run: undefined }))
})

test('engine limit: a subagent resumed by SendMessage raises no agent.spawn, so it stays done even when the list shows it running again', () => {
  const over: AgentRecord = { ...RUNNING, state: 'done', endedAt: NOW }
  expect(listed([over], [info('a1', 'running')], NOW + 5)).toEqual([over])
})

test("an agent's end keeps its answer, clipped at 2,000 characters, and adds up its tokens over resumed runs; the list names the plugin that spawned it", () => {
  const usage = { model: 'claude-haiku-5-5', input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 3 }
  expect(tokensOf(usage)).toBe(128)
  expect(tokensOf(undefined)).toBeUndefined()
  const [first] = ended([RUNNING], 'a1', true, NOW + 5, { result: 'x'.repeat(2_100), tokens: 128 })
  expect([first?.result?.length, first?.result?.endsWith('…'), first?.tokens]).toEqual([2_001, true, 128])
  const resumed = spawned([first!], { ...SPAWN, resume: { agentId: 'a1' } }, { model: 'm', agentId: 'a1' }, NOW + 9)
  expect(ended(resumed, 'a1', true, NOW + 20, { result: 'again', tokens: 72 })[0]).toEqual(expect.objectContaining({ result: 'again', tokens: 200 }))
  expect(listed([RUNNING], [info('a1', 'running', { spawnedBy: 'master-session' })], NOW)[0]?.spawnedBy).toBe('master-session')
  expect(listed([], [info('b2', 'running', { spawnedBy: 'lab' })], NOW)[0]?.spawnedBy).toBe('lab')
})
