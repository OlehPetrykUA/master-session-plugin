import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ModelCompleteInput, ModelCompleteResult, On } from 'claude-code'

import type { AgentRecord, Report, TaskText, WorkflowRecord } from '../../types'

import { rowFitOf } from '../lib/rowfit'
import { contentHeightOf } from '../lib/sections'
import type { SectionInput } from '../lib/sections'
import { itemsOf } from '../lib/list'
import type { Context } from '../lib/list'
import { rowsOf } from '../lib/rows'
import { FILE_MS, TICK_MS } from '../lib/constants'
import { C } from '../theme/tokens'
import { CREDENTIALS } from '../testing/credentials'
import { BOARD, BOARD_TOOL, HOME, PANE, SELF, SPAWN, childOf, liveOf, started, textsOf, altsOf, warmUp, world } from '../testing/world'
import type { Child } from '../testing/world'
import { INSTRUCTION, PLACEHOLDER, STRICT, cleaned, isUnsafe, normalized } from './describe'
import { reportPath } from './status'

const NOW = 3_600_000

const OPEN = 'mcp__master-session__open'

const START = 'mcp__ccd_session__start_session'

const T = 'Adds the model name to every row in the pane list, then reports back the commit once it is ready.'

const ZERO = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const say = (text: string): ModelCompleteResult => ({ isAnswered: true, text, usage: ZERO })

const API_ERROR: ModelCompleteResult = { isAnswered: false, reason: 'api-error', status: 500, error: 'server_error', usage: ZERO }

const EMPTY: ModelCompleteResult = { isAnswered: false, reason: 'empty-reply', usage: ZERO }

const ABORTED: ModelCompleteResult = { isAnswered: false, reason: 'aborted', usage: ZERO }

const brief = (command = 'Run the type check at the end.', extra = '') =>
  [
    'You are the Implementer persona of the master-session plugin, and you follow the worker protocol.',
    'Mission: build one deliverable from the brief in its own worktree.',
    'Inputs: the brief and the worker skill.',
    'Output: report updates, then the ready line.',
    'Gate: the commands in the brief pass.',
    'Must not: touch the live folder.',
    'Rule 7: keep the change small.',
    'Rule 8: keep the change small.',
    'Rule 9: keep the change small.',
    'Rule 10: keep the change small.',
    'Task:',
    'Add a model label to each pane row in hooks/components/list/Row.tsx and report ready with the sha.',
    'Rule 13: keep the change small.',
    'Rule 14: keep the change small.',
    'Rule 15: keep the change small.',
    'Rule 16: keep the change small.',
    'Rule 17: keep the change small.',
    'Rule 18: keep the change small.',
    'Commands to run:',
    command,
    'Rule 21: keep the change small.',
    'Rule 22: keep the change small.',
    'Rule 23: keep the change small.',
    'Rule 24: keep the change small.',
    'Rule 25: keep the change small.',
    'Rule 26: keep the change small.',
    'Rule 27: keep the change small.',
    'Rule 28: keep the change small.',
    'Rule 29: keep the change small.',
    'Rule 30: keep the change small.',
    'Rule 31: keep the change small.',
    'Rule 32: keep the change small.',
    'Rule 33: keep the change small.',
    'Rule 34: keep the change small.',
    'Rule 35: keep the change small.',
    'Rule 36: keep the change small.',
    'Rule 37: keep the change small.',
    'Rule 38: keep the change small.',
    'Rule 39: keep the change small.',
    'Report ready when done.',
    ...(extra ? [extra] : []),
  ].join('\n')

const P = brief()

const LINE_12 = 'Add a model label to each pane row in hooks/components/list/Row.tsx and report ready with the sha.'

const PROBE = {
  name: 'describe-probe',
  register(on: On) {
    on('ui.render', { component: 'Pane', requestId: 'describe-probe' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      const agents = await $.state.get({ plugin: 'master-session', key: 'agents' })
      const workflows = await $.state.get({ plugin: 'master-session', key: 'workflows' })
      const tasks = await $.state.get({ plugin: 'master-session', key: 'tasks' })
      return <Text>{JSON.stringify({ agents: ((agents.value ?? []) as AgentRecord[]).map(one => ({ id: one.id, task: one.task, prompt: one.prompt?.slice(0, 20) })), workflows: ((workflows.value ?? []) as WorkflowRecord[]).map(one => ({ id: one.id, task: one.task })), tasks: tasks.value ?? {} })}</Text>
    })
  },
}

type Atoms = { agents: { id: string; task?: TaskText; prompt?: string }[]; workflows: { id: string; task?: TaskText }[]; tasks: Record<string, TaskText> }

async function atomsOf($: Engine) {
  const ui = await $.ui.mount({ ...PANE, plugin: 'describe-probe', requestId: 'describe-probe', surface: 'terminal' })
  const atoms = JSON.parse(String((await ui.find({ type: 'Text' }))?.text)) as Atoms
  await ui.unmount()
  return atoms
}

const taskOf = async ($: Engine, id: string) => (await atomsOf($)).agents.find(one => one.id === id)?.task

function stub(on: On, answer: (request: ModelCompleteInput, nth: number) => ModelCompleteResult | Promise<ModelCompleteResult>) {
  const seen: ModelCompleteInput[] = []
  const flight = { open: 0, peak: 0 }
  on('model.complete', async (_, e) => {
    seen.push(e)
    flight.open += 1
    flight.peak = Math.max(flight.peak, flight.open)
    try {
      return { value: await answer(e, seen.length) }
    } finally {
      flight.open -= 1
    }
  })
  return { seen, flight }
}

function holding(on: On) {
  const gates: ((result: ModelCompleteResult) => void)[] = []
  const run = stub(on, () => new Promise<ModelCompleteResult>(done => gates.push(done)))
  return { ...run, gates, release: (result = say(T)) => gates.shift()?.(result) }
}

const LAUNCH = { status: 'async_launched' as const, taskId: 'wi5', taskType: 'local_workflow' as const, workflowName: 'row-model', runId: 'wf_1', summary: 'Row model run' }

const SCRIPT = "export const meta = { name: 'row-model', description: 'Spec, build and check the row model', phases: [{ title: 'Spec' }, { title: 'Build' }, { title: 'Check' }] }\nawait agent('x')"

function loops(on: On, options: { session?: string; only?: string; fixed?: string } = {}) {
  let spawned = 0
  const ids: string[] = []
  on('agent.list', () => ({ value: (options.only ? [options.only] : ids).map(id => ({ id, description: `task ${id}`, type: 'general-purpose', status: 'running' as const })) }))
  on('agent.spawn', (_, e) => {
    const id = options.fixed ?? (e.resume ? e.resume.agentId : e.workflow ? `w${e.workflow.agentIndex}` : `a${(spawned += 1)}`)
    if (!ids.includes(id)) ids.push(id)
    return { model: 'claude-haiku-5-5', agentId: id }
  })
  on('classic.PermissionRequest', () => ({}))
  on('classic.Notification', () => ({}))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', (_, e) => {
    if (e.tool === 'Workflow') return { result: LAUNCH, text: 'Workflow launched in background.' }
    if (e.tool === START) return { result: { content: [{ type: 'text', text: options.session ?? 'Session local_abc123 started.' }] }, text: 'started' } as never
    return { result: { stdout: '', stderr: '', interrupted: false }, text: '' } as never
  })
}

const WITH_SESSION = { ...BOARD, sessions: [...BOARD.sessions, { id: 'local_abc123', name: 'row-model', title: 'Row model', state: 'working', progress: 'step 1 of 3 — build' }] }

async function master($: Engine, on: On, session?: string) {
  loops(on, { session })
  return started($, on, WITH_SESSION)
}

const pane = ($: Engine, surface: 'desktop' | 'terminal' = 'desktop', columns = 60) => $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns: columns } } as never)

const spawn = ($: Engine, patch: Record<string, unknown> = {}) => $.agent.spawn({ ...SPAWN, description: 'Row model', subagentType: 'master-session:implementer', prompt: P, ...patch } as never)

const open = async ($: Engine, id: string) => void (await $.tool.call({ tool: OPEN, expand: id }))

const textsIn = (node: unknown): string[] => (typeof node === 'string' ? [node] : Array.isArray(node) ? node.flatMap(textsIn) : node && typeof node === 'object' ? textsIn((node as { children?: unknown }).children) : [])

const titleOf = async (ui: Awaited<ReturnType<typeof pane>>, id: string) => textsIn((await ui.find({ key: `task-title-${id}` }))?.children).join(' ')

const orderOf = async (ui: Awaited<ReturnType<typeof pane>>, key: string) => ((await ui.find({ key }))?.children ?? []).map(one => String((one as { props?: { key?: string }; type?: string }).props?.key ?? (one as { type?: string }).type))

const plainOf = async (ui: Awaited<ReturnType<typeof pane>>, id: string) => {
  const found = await ui.find({ key: `task-plain-${id}` })
  return found ? textsIn(found.children).join('') : undefined
}

const SENTENCES = (count: number) => Array.from({ length: count }, () => 'Adds a small label with the model name to every row of the pane list so each row shows which model it runs on.').join(' ')

warmUp()

test('AC1: one agent.spawn in a master makes exactly one model.complete with haiku, low effort, 200 tokens, 30 s and the name and line 12', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  expect(seen.length).toBe(1)
  expect(seen[0]).toEqual(expect.objectContaining({ model: 'haiku', effort: 'low', maxTokens: 200, timeoutMs: 30_000 }))
  expect(seen[0]?.prompt).toContain('Row model')
  expect(seen[0]?.prompt).toContain(LINE_12)
})

test('AC2: the system instruction names what to say and what to leave out', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  const system = String(seen[0]?.system)
  for (const part of ['1 to 3 plain English sentences', 'what it is asked to do', 'on what', 'what it hands back', 'credentials', 'keys', 'tokens', 'passwords', 'commands']) expect(system).toContain(part)
  expect(system).toBe(INSTRUCTION)
})

test('AC3: ten ticks, three card opens and a second board call add no call for that agent', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  expect(seen.length).toBe(1)
  for (let index = 0; index < 10; index += 1) await run.clock.advance(TICK_MS)
  for (let index = 0; index < 3; index += 1) {
    const ui = await pane($)
    await open($, 'a1')
    await ui.unmount()
  }
  await $.tool.call({ tool: BOARD_TOOL, ...WITH_SESSION })
  await run.clock.settle()
  expect(seen.length).toBe(1)
})

test('AC4: six workflow agents at once keep at most two requests open, and releasing them one by one ends all six Done', { plugins: [PROBE] }, async ($, on) => {
  const held = holding(on)
  const run = await master($, on)
  for (let index = 1; index <= 6; index += 1) await spawn($, { description: `scan ${index}`, workflow: { runId: 'wf_1', agentIndex: index } })
  await run.clock.settle()
  expect([held.seen.length, held.flight.open]).toEqual([2, 2])
  for (let index = 1; index <= 6; index += 1) {
    held.release()
    await run.clock.settle()
    expect(held.flight.open).toBeLessThanOrEqual(2)
  }
  expect(held.flight.peak).toBe(2)
  expect(held.seen.length).toBe(6)
  expect((await atomsOf($)).agents.map(one => one.task?.state)).toEqual(Array(6).fill('done'))
})

test('AC5: while the call is held the card shows the short name in semibold and Describing… muted', async ($, on) => {
  const held = holding(on)
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  const ui = await pane($)
  await open($, 'a1')
  const title = await ui.find({ key: 'task-title-a1' })
  const plain = await ui.find({ key: 'task-plain-a1' })
  expect(textsIn(title?.children).join(' ')).toBe('Row model')
  expect(JSON.stringify(title?.children)).toContain('"weight":"semibold"')
  expect(textsIn(plain?.children).join('')).toBe('Describing…')
  expect(JSON.stringify(plain?.children)).toContain(`"color":"${C.muted}"`)
  held.release()
  await ui.unmount()
})

test('AC6: the answer shows whole in task-plain, and no prompt row or N-line prompt line remains', async ($, on) => {
  const held = holding(on)
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  const ui = await pane($)
  await open($, 'a1')
  held.release()
  await run.clock.settle()
  expect(await plainOf(ui, 'a1')).toBe(T)
  expect(await ui.find({ key: 'task-prompt-a1' })).toBeUndefined()
  const all = JSON.stringify(await textsOf(ui))
  for (const gone of ['-line prompt', 'the whole prompt is in', 'You are the Implementer']) expect(all).not.toContain(gone)
  await ui.unmount()
})

test('AC7: at 47 columns a 420 character reply shows whole, never ending with …', async ($, on) => {
  const reply = `${(SENTENCES(3) + ' row'.repeat(30)).slice(0, 419)}.`
  stub(on, () => say(reply))
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  const ui = await pane($, 'desktop', 47)
  await open($, 'a1')
  const texts = textsIn((await ui.find({ key: 'task-plain-a1' }))?.children)
  expect(texts.join('')).toBe(reply)
  expect(reply.length).toBe(420)
  expect(texts.some(one => one.endsWith('…'))).toBe(false)
  await ui.unmount()
})

test('AC8: a Workflow call describes from its meta description, phases and script, and the card holds the Task block between the strip and Agents', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await run.clock.settle()
  expect(seen.length).toBe(1)
  for (const part of ['Spec, build and check the row model', 'Spec', 'Build', 'Check']) expect(seen[0]?.prompt).toContain(part)
  const ui = await pane($)
  await open($, 'wf_1')
  expect(await titleOf(ui, 'wf_1')).toBe('row-model')
  expect(await plainOf(ui, 'wf_1')).toBe(T)
  const keys = await orderOf(ui, 'body-wf_1')
  expect(keys.indexOf('Svg')).toBeGreaterThan(-1)
  expect(keys.indexOf('task-wf_1')).toBeGreaterThan(keys.indexOf('Svg'))
  expect(keys.indexOf('agents-wf_1')).toBeGreaterThan(keys.indexOf('task-wf_1'))
  await ui.unmount()
})

test('AC9: a workflow agent shows its label and the reply to its own prompt, not the workflow’s', async ($, on) => {
  stub(on, request => say(String(request.prompt).includes('Kind: workflow agent') ? 'Checks the single agent of the run and says what it found.' : T))
  const run = await master($, on)
  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await spawn($, { description: 'scan one', prompt: 'Scan the first folder of the repo.', workflow: { runId: 'wf_1', agentIndex: 1 } })
  await run.clock.settle()
  const ui = await pane($)
  await open($, 'w1')
  expect(await titleOf(ui, 'w1')).toBe('scan one')
  expect(await plainOf(ui, 'w1')).toBe('Checks the single agent of the run and says what it found.')
  await ui.unmount()
})

test('AC10: a start_session call describes the new session from its prompt and the card holds the Task block before Now and Next', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  await $.tool.call({ tool: START, title: 'Row model', prompt: P } as never)
  await run.clock.settle()
  expect(seen.length).toBe(1)
  expect(seen[0]?.prompt).toContain(LINE_12)
  const ui = await pane($)
  await open($, 'local_abc123')
  expect(await titleOf(ui, 'local_abc123')).toBe('Row model')
  expect(await plainOf(ui, 'local_abc123')).toBe(T)
  const keys = await orderOf(ui, 'body-local_abc123')
  expect(keys.indexOf('task-local_abc123')).toBeGreaterThan(-1)
  expect(keys.indexOf('pair-now-local_abc123')).toBeGreaterThan(keys.indexOf('task-local_abc123'))
  await ui.unmount()
})

test('AC11: api-error, empty-reply, aborted and the 30 s timeout all leave the short name only', async ($, on) => {
  const replies = [API_ERROR, EMPTY, ABORTED]
  stub(on, (_, nth) => (nth <= 3 ? (replies[nth - 1] ?? API_ERROR) : new Promise<ModelCompleteResult>(() => undefined)))
  const run = await master($, on)
  for (const name of ['one', 'two', 'three', 'four']) await spawn($, { description: name })
  await run.clock.settle()
  await run.clock.advance(30_000)
  await run.clock.settle()
  const ui = await pane($)
  for (const id of ['a1', 'a2', 'a3', 'a4']) {
    await open($, id)
    expect(await ui.find({ key: `task-title-${id}` })).toBeDefined()
    expect(await ui.find({ key: `task-plain-${id}` })).toBeUndefined()
  }
  expect((await textsOf(ui)).includes('Describing…')).toBe(false)
  await ui.unmount()
})

test('AC12: a hot reload while the call is held shows the short name only and makes no new call, even when the old call answers later', async ($, on) => {
  const held = holding(on)
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  const ui = await pane($)
  await open($, 'a1')
  expect(await ui.find({ key: 'task-title-a1' })).toBeDefined()
  expect(await ui.find({ key: 'task-plain-a1' })).toBeUndefined()
  held.release()
  await run.clock.settle()
  expect(await ui.find({ key: 'task-plain-a1' })).toBeUndefined()
  expect(held.seen.length).toBe(1)
  await ui.unmount()
})

test('AC13: a blank reply is the short name, 700 characters store 600 plus …, control characters and runs of space collapse', { plugins: [PROBE] }, async ($, on) => {
  const long = Array.from({ length: 140 }, () => 'label').join(' ')
  const replies = ['   ', long.slice(0, 700), 'Line one.\n\n\tLine two.\u0007']
  stub(on, (_, nth) => say(replies[nth - 1] ?? ''))
  const run = await master($, on)
  for (const name of ['one', 'two', 'three']) await spawn($, { description: name })
  await run.clock.settle()
  const tasks = (await atomsOf($)).agents.map(one => one.task)
  expect(tasks[0]).toEqual({ state: 'failed' })
  expect(tasks[1]?.text).toBe(`${long.slice(0, 600)}…`)
  expect(tasks[2]?.text).toBe('Line one. Line two.')
  const ui = await pane($)
  await open($, 'a2')
  expect((await plainOf(ui, 'a2'))?.length).toBe(601)
  await open($, 'a3')
  expect(await plainOf(ui, 'a3')).toBe('Line one. Line two.')
  await open($, 'a1')
  expect(await plainOf(ui, 'a1')).toBeUndefined()
  await ui.unmount()
})

test('AC14: no call for a session start_session did not start, an agent only agent.list knows, or a start_session result with no local id', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on, 'Started.')
  await $.tool.call({ tool: START, title: 'Row model', prompt: P } as never)
  await run.clock.settle()
  expect(seen.length).toBe(0)
  const ui = await pane($)
  await open($, 'local_env')
  expect(await ui.find({ key: 'task-title-local_env' })).toBeDefined()
  expect(await ui.find({ key: 'task-plain-local_env' })).toBeUndefined()
  await ui.unmount()
})

test('AC14: an agent only agent.list knows gets no call and its card shows the short name only', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  loops(on, { only: 'zz' })
  const run = await started($, on, WITH_SESSION)
  await run.clock.advance(60_000)
  await run.clock.settle()
  expect(seen.length).toBe(0)
  const ui = await pane($)
  await open($, 'zz')
  expect(await ui.find({ key: 'task-title-zz' })).toBeDefined()
  expect(await ui.find({ key: 'task-plain-zz' })).toBeUndefined()
  await ui.unmount()
})

test('AC15: a plain chat makes no model call for three spawns, a Workflow and a start_session, and its cards show short names only', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  loops(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  for (const name of ['one', 'two', 'three']) await spawn($, { description: name })
  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await $.tool.call({ tool: START, title: 'Row model', prompt: P } as never)
  await run.clock.settle()
  expect(seen.length).toBe(0)
  const ui = await pane($)
  await open($, 'a1')
  expect(await ui.find({ key: 'task-plain-a1' })).toBeUndefined()
  await ui.unmount()
})

async function worker($: Engine, on: On, child: Child = childOf(NOW)) {
  const writes: { path: string; text: string }[] = []
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('skill.prompt', (_, e) => ({ text: e.text }))
  loops(on)
  const run = world(on, child)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await run.clock.advance(1_000)
  const mine = () => writes.filter(one => one.path === reportPath(HOME, 'local_worker')).map(one => JSON.parse(one.text) as Report)
  return { run, writes, mine }
}

test('AC16: a worker makes one call for its subagent and its next report holds agents[].task Done with the text', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const { run, mine } = await worker($, on)
  await spawn($)
  await run.clock.settle()
  await run.clock.advance(1_000)
  expect(seen.length).toBe(1)
  expect(mine().at(-1)?.agents?.[0]?.task).toEqual({ state: 'done', text: T })
  expect(mine().at(-1)?.agents?.[0]?.model).toBe('claude-haiku-5-5')
})

const workSession = { sessionId: 'local_work', name: 'work', title: 'Implementer · Row details', cwd: `${HOME}/dotfiles`, isRunning: true, isArchived: false, lastActivityAt: '1970-01-01T00:59:00.000Z', startedBy: SELF }

const workReport = (patch: Record<string, unknown>) =>
  JSON.stringify({ v: 1, kind: 'status', session: 'local_work', engineId: 'engine-work', parent: SELF, seq: 1, at: NOW, run: { isRunning: true, since: NOW - 60_000 }, modelAt: NOW - 30_000, state: 'working', activity: [], commits: [], tests: [], files: [], ...patch })

const WORK_BOARD = { ...BOARD, sessions: [{ id: 'local_work', name: 'work', title: 'Implementer · Row details', state: 'working', progress: 'step 2 of 4 — build' }], needsYou: [] }

test('AC17: the master shows the text a worker reported for its subagent and makes no call for it', async ($, on) => {
  const { seen } = stub(on, () => say('Wrong text from the master.'))
  loops(on)
  const report = workReport({ agents: [{ id: 'b1', type: 'general-purpose', description: 'Row model', state: 'running', startedAt: NOW - 5_000, task: { state: 'done', text: T } }] })
  const run = await started($, on, WORK_BOARD, { sessions: [workSession], files: { [reportPath(HOME, 'local_work')]: report } })
  await run.clock.advance(60_000)
  const ui = await pane($)
  await open($, 'b1')
  expect(await plainOf(ui, 'b1')).toBe(T)
  expect(seen.length).toBe(0)
  await ui.unmount()
})

test('AC18: a worker’s Workflow report holds runs[].task and the master’s workflow card shows it', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const { run, mine } = await worker($, on)
  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await run.clock.settle()
  await run.clock.advance(1_000)
  expect(seen.length).toBe(1)
  expect(mine().at(-1)?.runs?.[0]?.task).toEqual({ state: 'done', text: T })
})

test('AC18: the master’s workflow record for a worker’s run holds the reported task', { plugins: [PROBE] }, async ($, on) => {
  stub(on, () => say('Wrong text from the master.'))
  loops(on)
  const report = workReport({ runs: [{ id: 'wf_9', name: 'row-model', phases: [], startedAt: NOW - 5_000, task: { state: 'done', text: T } }], agents: [{ id: 'b1', type: 'general-purpose', description: 'scan', state: 'running', startedAt: NOW - 5_000, runId: 'wf_9', runIndex: 1 }] })
  const run = await started($, on, WORK_BOARD, { sessions: [workSession], files: { [reportPath(HOME, 'local_work')]: report } })
  await run.clock.advance(60_000)
  expect((await atomsOf($)).workflows.find(one => one.id === 'wf_9')?.task).toEqual({ state: 'done', text: T })
})

const secretsIn = (all: string, secrets: readonly string[]) => secrets.filter(secret => all.includes(secret))

const CUED_ROWS = new Set([...Array.from({ length: 48 }, (_, index) => index + 1), 52, 57, 64, 66, 72, 75, 81, 84, 85])

test('AC19: for every credential row a copied prompt is rejected twice, the second call strict, and no text is stored or drawn', { plugins: [PROBE], timeoutMs: 120_000 }, async ($, on) => {
  const { seen } = stub(on, request => say(String(request.prompt)))
  const run = await master($, on)
  const ui = await pane($)
  let before = 0
  for (const [index, [row, command, secrets]] of CREDENTIALS.entries()) {
    await spawn($, { description: `row ${index}`, prompt: brief(command) })
    await run.clock.settle()
    if (CUED_ROWS.has(row)) {
      expect(seen.length - before).toBe(0)
    } else {
      expect(seen.length - before).toBe(2)
      expect(String(seen.at(-1)?.system)).toContain(STRICT)
      expect(String(seen.at(-2)?.system)).not.toContain(STRICT)
    }
    before = seen.length
    await open($, `a${index + 1}`)
    expect(secretsIn(JSON.stringify([await textsOf(ui), await altsOf(ui)]), secrets)).toEqual([])
    expect(secretsIn(JSON.stringify((await atomsOf($)).agents.map(one => one.task)), secrets)).toEqual([])
  }
  await ui.unmount()
})

test('AC20: the same rows through a Workflow script and a start_session prompt store nothing', { plugins: [PROBE], timeoutMs: 120_000 }, async ($, on) => {
  const { seen } = stub(on, request => say(String(request.prompt)))
  const run = await master($, on)
  for (const [row, command, secrets] of CREDENTIALS) {
    const before = seen.length
    await $.tool.call({ tool: 'Workflow', script: `${SCRIPT}\n${command}` })
    await $.tool.call({ tool: START, title: 'Row model', prompt: brief(command) } as never)
    await run.clock.settle()
    expect(seen.length - before).toBe(CUED_ROWS.has(row) ? 0 : 4)
    const atoms = await atomsOf($)
    expect(secretsIn(JSON.stringify(atoms.tasks) + JSON.stringify(atoms.workflows.map(one => one.task)), secrets)).toEqual([])
  }
})

const GUARDED = /[\d`\\=:@$";|&<>{}[\]'-]/

test('AC21: a reply that names the row’s secrets is never stored', { plugins: [PROBE], timeoutMs: 120_000 }, async ($, on) => {
  let secrets: readonly string[] = []
  let wrap = (secret: string) => secret
  stub(on, () => say(`It uses ${secrets.map(wrap).join(' and ')} to finish.`))
  const run = await master($, on)
  let count = 0
  for (const wrapper of [(secret: string) => secret, (secret: string) => `"${secret}"`, (secret: string) => `«${secret}»`]) {
    wrap = wrapper
    for (const [, command, row] of CREDENTIALS) {
      if (!row.every(secret => secret.split(' ').some(word => GUARDED.test(word)))) continue
      secrets = row
      count += 1
      await spawn($, { description: `row ${count}`, prompt: brief(command) })
      await run.clock.settle()
      const stored = (await atomsOf($)).agents.map(one => one.task?.text ?? '').join('\n')
      expect(secretsIn(stored, row)).toEqual([])
    }
  }
  expect(count).toBeGreaterThan(240)
})

test('AC22: a worker’s report writes hold none of the rows’ secrets', { timeoutMs: 120_000 }, async ($, on) => {
  stub(on, request => say(String(request.prompt)))
  const { run, writes } = await worker($, on)
  for (const [index, [, command, secrets]] of CREDENTIALS.entries()) {
    const from = writes.length
    await spawn($, { description: `row ${index}`, prompt: brief(command) })
    await run.clock.settle()
    await run.clock.advance(1_000)
    expect(secretsIn(writes.slice(from).map(one => one.text).join('\n'), secrets)).toEqual([])
  }
})

test('AC23: plain names such as Row.tsx and pane-header pass the guard', async ($, on) => {
  stub(on, () => say('Updates Row.tsx and pane-header so each row shows its model.'))
  const run = await master($, on)
  await spawn($, { prompt: brief('Run the type check at the end.', 'Touch Row.tsx and pane-header only.') })
  await run.clock.settle()
  const ui = await pane($)
  await open($, 'a1')
  expect(await plainOf(ui, 'a1')).toBe('Updates Row.tsx and pane-header so each row shows its model.')
  await ui.unmount()
})

test('AC24: the terminal card holds Task: Row model, then the text, and no prompt line', async ($, on) => {
  stub(on, () => say(T))
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  const ui = await pane($, 'terminal')
  await open($, 'a1')
  const texts = (await textsOf(ui)).map(String)
  const at = texts.indexOf('Task: Row model')
  expect(at).toBeGreaterThan(-1)
  expect(texts[at + 1]).toBe(T)
  expect(texts.some(one => one.includes('You are the Implementer'))).toBe(false)
  await ui.unmount()
})

test('AC25: the terminal workflow and session cards hold Task: <short name> then their reply', async ($, on) => {
  stub(on, () => say(T))
  const run = await master($, on)
  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await $.tool.call({ tool: START, title: 'Row model', prompt: P } as never)
  await run.clock.settle()
  const ui = await pane($, 'terminal')
  for (const [id, name] of [['wf_1', 'row-model'], ['local_abc123', 'Row model']] as const) {
    await open($, id)
    const texts = (await textsOf(ui)).map(String)
    const at = texts.indexOf(`Task: ${name}`)
    expect([at > -1, texts[at + 1]]).toEqual([true, T])
  }
  await ui.unmount()
})

test('AC26: no precomputed height leaves the Task rows out: an open card has none, and a row’s height is the same with any task state', () => {
  const input: SectionInput = {
    columns: 47,
    repos: [],
    isNarrow: true,
    notice: '',
    status: '',
    buttons: [],
    narrativeRows: 0,
    hasNarrativeMore: false,
    blockRows: 2,
    blockExtra: 0,
    chips: [],
    groups: [{ rows: 1, extra: 0, isArchived: false }],
    hasMore: false,
    isEmpty: false,
    hasExpanded: false,
  }
  expect(contentHeightOf(input)).toBeDefined()
  expect(contentHeightOf({ ...input, hasExpanded: true })).toBeUndefined()
  const agent = (task?: TaskText): AgentRecord => ({ id: 'a1', type: 'general-purpose', description: 'Row model', state: 'running', startedAt: NOW - 1_000, task })
  const context = (task?: TaskText): Context => ({ at: NOW, trees: [], sessions: [], agents: [agent(task)], rows: rowsOf(null, liveOf()) })
  const heights = [undefined, { state: 'pending' as const }, { state: 'done' as const, text: SENTENCES(3).slice(0, 420) }].map(task => {
    const [item] = itemsOf([], [agent(task)], [])
    return rowFitOf(item!, context(task), { width: 47 * 8, isNarrow: true, home: '/h' }).height
  })
  expect(new Set(heights).size).toBe(1)
})

test('AC27: a guard rejection makes one more call under a stricter instruction, and its accepted reply is shown', async ($, on) => {
  const replies = ['It handles step3 of the plan for you.', T]
  const { seen } = stub(on, (_, nth) => say(replies[nth - 1] ?? ''))
  const run = await master($, on)
  await spawn($, { prompt: brief('Run the type check at the end.', 'Version 2 of the plan covers step3.') })
  await run.clock.settle()
  expect(seen.length).toBe(2)
  expect(String(seen[1]?.system)).toContain('Use no identifiers, numbers, paths, quotes or commands.')
  expect(String(seen[0]?.system)).not.toContain('Use no identifiers')
  const ui = await pane($)
  await open($, 'a1')
  expect(await plainOf(ui, 'a1')).toBe(T)
  await ui.unmount()
})

test('AC28: a workflow agent whose prompt is the hidden-script placeholder gets no call and shows its label only', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  await $.tool.call({ tool: 'Workflow', script: SCRIPT })
  await spawn($, { description: 'hidden one', prompt: PLACEHOLDER, workflow: { runId: 'wf_1', agentIndex: 1 } })
  await run.clock.settle()
  expect(seen.length).toBe(1)
  const ui = await pane($)
  await open($, 'w1')
  expect(await titleOf(ui, 'w1')).toBe('hidden one')
  expect(await ui.find({ key: 'task-plain-w1' })).toBeUndefined()
  await ui.unmount()
  expect(PLACEHOLDER).toBe('(withheld: this workflow run does not share its script)')
})

test('AC29: an api-error and a timeout each make exactly one call, with no retry', async ($, on) => {
  const { seen } = stub(on, (_, nth) => (nth === 1 ? API_ERROR : new Promise<ModelCompleteResult>(() => undefined)))
  const run = await master($, on)
  await spawn($, { description: 'one' })
  await run.clock.settle()
  await spawn($, { description: 'two' })
  await run.clock.settle()
  await run.clock.advance(30_000)
  await run.clock.settle()
  await run.clock.advance(120_000)
  expect(seen.length).toBe(2)
})

test('the guard and the cleaning: words in the source with a digit, a leading dash or a stray quote are caught', () => {
  expect(isUnsafe('Runs step3 first.', 'step3 here')).toBe(true)
  expect(isUnsafe('Runs step3 first.', 'nothing here')).toBe(false)
  expect(isUnsafe('Uses -p to log in.', 'mysql -p x')).toBe(true)
  expect(isUnsafe('It isn’t "quoted" here', 'say "quoted" now')).toBe(true)
  expect(isUnsafe("Doesn't touch Row.tsx or pane-header.", "Doesn't touch Row.tsx or pane-header.")).toBe(false)
  expect(cleaned('  a\u0007 b\n\n\tc  ')).toBe('a b c')
})

test('a secret in quotes, brackets or guillemets is still caught, and one cut by the 600 character cap is caught before the cut', () => {
  for (const reply of ['It uses "pw02" to finish.', 'It uses (pw02).', 'It uses «pw02».', 'It uses “pw02”.', "It uses 'pw02'."]) expect(isUnsafe(cleaned(reply), 'mysql -u root -p pw02 db')).toBe(true)
  const long = `${'x'.repeat(590)} sk-tok32abcdefghijklmnop`
  expect(cleaned(long)).not.toContain('sk-tok32abcdefghijklmnop')
  expect(isUnsafe(normalized(long), 'export KEY=sk-tok32abcdefghijklmnop')).toBe(true)
})

test('a worker’s start_session makes no call: side chats are the master’s', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const { run } = await worker($, on)
  await $.tool.call({ tool: START, title: 'Row model', prompt: P } as never)
  await run.clock.settle()
  expect(seen.length).toBe(0)
})

test('a resume keeps the stored prompt and task, and makes no new call', { plugins: [PROBE] }, async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  await $.agent.spawn({ ...SPAWN, description: 'Row model', subagentType: 'master-session:implementer', prompt: 'rebase onto main', resume: { agentId: 'a1' } } as never)
  await run.clock.settle()
  const [agent] = (await atomsOf($)).agents
  expect(seen.length).toBe(1)
  expect([agent?.prompt, agent?.task]).toEqual([P.slice(0, 20), { state: 'done', text: T }])
})

test('a secret that would fall across the 600 character cap is rejected, not stored cut', { plugins: [PROBE] }, async ($, on) => {
  stub(on, () => say(`${'x'.repeat(597)} sk-tok32abcdefghijklmnop`))
  const run = await master($, on)
  await spawn($, { prompt: brief('export KEY=sk-tok32abcdefghijklmnop') })
  await run.clock.settle()
  expect((await atomsOf($)).agents[0]?.task).toEqual({ state: 'failed' })
})

test('a workflow whose script cannot be read gets no call even when the launch carries a summary', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  await $.tool.call({ tool: 'Workflow', scriptPath: '/missing/run.js' } as never)
  await run.clock.settle()
  expect(seen.length).toBe(0)
})

test('a subagent spawned by another subagent gets its own call and task', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  await spawn($, { description: 'Parent design' })
  await spawn($, { description: 'Static analysis', parentAgentId: 'a1' })
  await run.clock.settle()
  expect(seen.length).toBe(2)
  const ui = await pane($)
  await open($, 'a2')
  expect(await plainOf(ui, 'a2')).toBe(T)
  await ui.unmount()
})

test('an agent spawned before the chat became a master is described once when it does, and ticks add no more', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  loops(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await spawn($, { description: 'Early design' })
  await run.clock.settle()
  expect(seen.length).toBe(0)
  await $.tool.call({ tool: BOARD_TOOL, ...WITH_SESSION })
  await run.clock.advance(FILE_MS)
  await run.clock.settle()
  expect(seen.length).toBe(1)
  const ui = await pane($)
  await open($, 'a1')
  expect(await plainOf(ui, 'a1')).toBe(T)
  await ui.unmount()
  await run.clock.advance(FILE_MS * 6)
  await run.clock.settle()
  expect(seen.length).toBe(1)
})

test('after a hot reload an agent whose call was dropped is described once more, and ticks add no more', async ($, on) => {
  const held = holding(on)
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await run.clock.advance(FILE_MS * 4)
  await run.clock.settle()
  expect(held.seen.length).toBe(2)
  held.release()
  held.release()
  await run.clock.settle()
  const ui = await pane($)
  await open($, 'a1')
  expect(await plainOf(ui, 'a1')).toBe(T)
  await ui.unmount()
  await run.clock.advance(FILE_MS * 4)
  expect(held.seen.length).toBe(2)
})

test('an agent whose call failed is not described again by later ticks', async ($, on) => {
  const { seen } = stub(on, () => API_ERROR)
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  await run.clock.advance(FILE_MS * 6)
  await run.clock.settle()
  expect(seen.length).toBe(1)
})

test('a resumed agent that has a task is not described again by ticks', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  await $.agent.spawn({ ...SPAWN, description: 'Row model', subagentType: 'master-session:implementer', prompt: 'rebase onto main', resume: { agentId: 'a1' } } as never)
  await run.clock.advance(FILE_MS * 4)
  await run.clock.settle()
  expect(seen.length).toBe(1)
})

test('a copied strict reply stays rejected when the secret is a plain word next to a flag', async ($, on) => {
  const { seen } = stub(on, request => say(String(request.prompt)))
  const run = await master($, on)
  const rows = [
    ['mysql -p hunter db', 'hunter'],
    ['mysql --password letmein db', 'letmein'],
  ] as const
  for (const [index, [command, secret]] of rows.entries()) {
    const before = seen.length
    await spawn($, { description: `plain ${index}`, prompt: brief(command) })
    await run.clock.settle()
    expect(seen.length - before).toBe(0)
    const ui = await pane($)
    await open($, `a${index + 1}`)
    expect(await ui.find({ key: `task-plain-a${index + 1}` })).toBeUndefined()
    expect(secretsIn(JSON.stringify(await textsOf(ui)), [secret])).toEqual([])
    await ui.unmount()
  }
})

test('a plain secret next to an id-shaped word is never stored or drawn, even when both replies copy the prompt', { plugins: [PROBE] }, async ($, on) => {
  const { seen } = stub(on, request => say(String(request.prompt)))
  const run = await master($, on)
  const prompts = ['Connect as user7 with password hunter and report back.', 'Log in to db2 with the password hunter, then report back.']
  for (const [index, prompt] of prompts.entries()) {
    const before = seen.length
    await spawn($, { description: `ids ${index}`, prompt })
    await run.clock.settle()
    expect(seen.length - before).toBe(0)
    const ui = await pane($)
    await open($, `a${index + 1}`)
    expect(await ui.find({ key: `task-plain-a${index + 1}` })).toBeUndefined()
    expect(secretsIn(JSON.stringify([await textsOf(ui), await altsOf(ui)]), ['hunter'])).toEqual([])
    await ui.unmount()
  }
  expect((await atomsOf($)).agents.map(one => one.task)).toEqual([{ state: 'failed' }, { state: 'failed' }])
})

test('a letters-only secret in a paraphrased reply: a source with a credential cue makes no model call and is stored failed', { plugins: [PROBE] }, async ($, on) => {
  const { seen } = stub(on, () => say('Signs in with the password hunter and reports back.'))
  const run = await master($, on)
  await spawn($, { description: 'login', prompt: 'Sign in with the password hunter and report back.' })
  await run.clock.settle()
  expect(seen.length).toBe(0)
  const ui = await pane($)
  await open($, 'a1')
  expect(secretsIn(JSON.stringify([await textsOf(ui), await altsOf(ui)]), ['hunter'])).toEqual([])
  await ui.unmount()
  expect((await atomsOf($)).agents.map(one => one.task)).toEqual([{ state: 'failed' }])
})

test('each credential cue word stops the call, for a prompt and for a workflow script', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  const cues = ['password', 'passwd', 'pwd', 'passphrase', 'apikey', 'api key', 'api_key', 'api-key', 'access key', 'private key', 'bearer', 'PASSWORD', 'PGPASSWORD=x', 'token: x', 'SECRET=x', 'auth: x', 'key=x', 'Authorization: x', 'MY_KEY=x', 'DB_PASS', 'GITHUB_TOKEN', '--token x', '--pass x', '--secret x', '--auth x', '--password', 'run x -pvalue','redis-cli -a pw', 'curl -u me:pw', 'git clone https://me:pw@host', 'psql postgres://app:pw@db', `curl -d '{"token":"hunter"}' x`, '{"client_secret":"hunter"}', '{"auth" : "hunter"}', "clientSecret: 'hunter'", 'accessToken=hunter', '//r/:_authToken=hunter', "secretAccessKey: 'hunter'", 'PW=hunter', '--from-literal=pw=hunter', 'identified by x', 'ghp_abc', 'gho_abc', 'github_pat_abc', 'glpat-abc', 'xoxb-abc', 'sk-abc', 'AKIAabc', 'ASIAabc', 'hvs.abc', 'npm_abc', '-phunter', '"-phunter"', 'mysql -p hunter', 'mariadb -P hunter', 'mysqldump -p hunter', 'sshpass -p hunter', 'sqlcmd -P hunter', 'docker login -u me -p hunter registry', 'podman login -p hunter quay.io', 'az login -u me -p hunter', 'mongosh -u u -p hunter', 'ssh-keygen -p -P old -N new -f k', 'curl -X POST https://hooks.slack.com/services/T/B/hunter', 'git push https://hunter@github.com/o/r.git main', 'gh secret set NAME --body hunter', 'vault login hunter', 'echo hunter | sudo -S x', 'ARGS=(--token hunter)', 'curl --user me:hunter x', 'curl --user=me:hunter x', 'oc login -u me -p hunter', 'cf login -u me -p hunter', 'zip -P hunter out.zip in', 'unzip -P hunter out.zip', 'mosquitto_pub -u me -P hunter -t x', 'ldapsearch -x -D cn=me -w hunter', 'smbclient //h/s -U me%hunter', 'sudo -S <<< hunter ls']
  for (const [index, cue] of cues.entries()) {
    await spawn($, { description: `cue ${index}`, prompt: `Build the band now line with ${cue} included.` })
    await $.tool.call({ tool: 'Workflow', script: `${SCRIPT}\n// ${cue}` })
    await run.clock.settle()
  }
  expect(seen.length).toBe(0)
})

test('a normal prompt still gets a call, and passes, passing, authored and tokenize are no cue', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  const run = await master($, on)
  const prompts = ['Build the band now line.', 'Make the tests passes quickly.', 'Keep the tests passing.', 'The file was authored by hand.', 'Then tokenize the words.', 'Make sure no secret is ever shown.', 'Keep the token cost low.', 'Report when your checks pass.', 'Fix the auth flow.', 'Mention the key point.', 'Run tsc -p . at the end.', 'Run npx tsc -p /x/wt at the end.', 'Run mkdir -p out first.', 'Run docker run -p 8080:80 img.', 'Connect with ssh -p 22 host.', 'Run git add -p now.', 'Run git commit -a -m fix now.', 'Run git log --author me.']
  for (const [index, prompt] of prompts.entries()) {
    const before = seen.length
    await spawn($, { description: `plain ${index}`, prompt })
    await run.clock.settle()
    expect(seen.length - before).toBe(1)
  }
})

test('two spawn events for one agent id at once make one call', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  loops(on, { fixed: 'dup' })
  const run = await started($, on, WITH_SESSION)
  await Promise.all([spawn($, { description: 'one' }), spawn($, { description: 'two' })])
  await run.clock.settle()
  expect(seen.length).toBe(1)
})

test('a failed call is stored as failed and not tried again after a reload and ticks', async ($, on) => {
  const { seen } = stub(on, () => API_ERROR)
  const run = await master($, on)
  await spawn($)
  await run.clock.settle()
  expect(seen.length).toBe(1)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await run.clock.advance(FILE_MS * 6)
  await run.clock.settle()
  expect(seen.length).toBe(1)
})

test('a stored agent of a worker session gets no call from the tick sweep', async ($, on) => {
  const { seen } = stub(on, () => say(T))
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    const agents = [{ id: 'r1', type: 'Explore', description: 'Remote one', prompt: 'Look around.', state: 'running', startedAt: 0, parentSessionId: 'local_w' }]
    return (e.key === 'agents' ? { value: { ...real.value, value: agents } } : real) as never
  })
  const run = await master($, on)
  await run.clock.advance(FILE_MS * 4)
  await run.clock.settle()
  expect(seen.length).toBe(0)
})
