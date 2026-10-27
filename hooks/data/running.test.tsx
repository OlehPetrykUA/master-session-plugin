import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import type { AgentRecord, Report } from '../../types'

import { FILE_MS, LIVE_MS, TICK_MS } from '../lib/constants'
import { BAND, BOARD, BOARD_TOOL, HOME, PANE, SELF, SPAWN, altsOf, buttonsOf, childOf, labelOf, started, textsOf, warmUp, world } from '../testing/world'
import { CREDENTIALS } from '../testing/credentials'
import type { Child, Ui } from '../testing/world'
import { reportPath } from './status'

const NOW = 3_600_000

const OPEN = 'mcp__master-session__open'

const REPORT = 'mcp__master-session__report'

const PROBE = {
  name: 'running-probe',
  register(on: On) {
    on('ui.render', { component: 'Pane', requestId: 'running-probe' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      const agents = await $.state.get({ plugin: 'master-session', key: 'agents' })
      return <Text>{JSON.stringify(agents.value ?? [])}</Text>
    })
  },
}

async function agentsOf($: Engine) {
  const ui = await $.ui.mount({ ...PANE, plugin: 'running-probe', requestId: 'running-probe', surface: 'terminal' })
  const agents = JSON.parse(String((await ui.find({ type: 'Text' }))?.text)) as AgentRecord[]
  await ui.unmount()
  return agents
}

const hhmm = (ms: number) => `${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`

const gates = new Map<string, () => void>()

const counts = { list: 0 }

function loops(on: On, ids: string[] = ['a1'], spawned = 'a1') {
  on('agent.list', () => {
    counts.list += 1
    return { value: ids.map((id): AgentInfo => ({ id, description: `task ${id}`, type: 'general-purpose', status: 'running' })) }
  })
  on('agent.spawn', (_, e) => ({ model: 'claude-haiku-5-5', agentId: e.workflow ? `w${e.workflow.agentIndex}` : spawned }))
  on('classic.PermissionRequest', () => ({}))
  on('classic.Notification', () => ({}))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', async (_, e) => {
    if ('command' in e && e.command === 'boom') throw new Error('boom')
    await new Promise<void>(done => gates.set(e.tool_use_id, done))
    return { result: { stdout: '', stderr: '', interrupted: false }, text: '' } as never
  })
}

type Input = Parameters<Engine['tool']['call']>[0]

type Run = ReturnType<typeof world>

let seq = 0

async function hold($: Engine, run: Run, input: Record<string, unknown>) {
  seq += 1
  const id = `toolu_run_${seq}`
  const call = $.tool.call({ tool_use_id: id, ...input } as unknown as Input)
  await run.clock.advance(1)
  const end = async () => {
    gates.get(id)?.()
    await call
  }
  return { call, end }
}

type Mounted = Awaited<ReturnType<Engine['ui']['mount']>>

const lineOf = async (ui: Mounted, id: string, scope = 'row') => [await labelOf(ui, `${scope}-${id}-text`), await labelOf(ui, `${scope}-${id}-cmd-dot`), await labelOf(ui, `${scope}-${id}-cmd-elapsed`)].join(' ')

const has = async (ui: Mounted, word: string) => (await textsOf(ui)).some(text => String(text).includes(word))

const BASH = { tool: 'Bash', command: 'npm test --silent', agentId: 'a1' }

const SECRET = 'GITHUB_TOKEN=ghp_abc123 curl -H "Authorization: Bearer abc123" "https://api.x.dev/v1?api_key=k123&q=1"'

async function master($: Engine, on: On, ids = ['a1'], child: Child = {}, board: unknown = BOARD) {
  loops(on, ids)
  const run = await started($, on, board, child)
  if (ids.includes('a1')) await $.agent.spawn({ ...SPAWN, description: 'Find callers', subagentType: 'Explore' })
  await run.clock.settle()
  return run
}

const pane = ($: Engine, props: Record<string, unknown> = {}) => $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, ...props } } as never)

const WORK_BOARD = { ...BOARD, sessions: [{ id: 'local_work', name: 'work', title: 'Implementer · Row details', state: 'working', progress: 'step 2 of 4 — build' }], needsYou: [] }

const workReport = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    kind: 'status',
    session: 'local_work',
    engineId: 'engine-work',
    parent: SELF,
    seq: 1,
    at: NOW,
    run: { isRunning: true, since: NOW - 60_000 },
    modelAt: NOW - 30_000,
    state: 'working',
    activity: [],
    commits: [],
    tests: [],
    files: [],
    running: { tool: 'Bash', since: NOW - 12_000 },
    ...patch,
  })

const workSession = (isRunning = true) => ({ sessionId: 'local_work', name: 'work', title: 'Implementer · Row details', cwd: `${HOME}/dotfiles`, isRunning, isArchived: false, lastActivityAt: '1970-01-01T00:59:00.000Z', startedBy: SELF })

const workChild = (report: string, isRunning = true): Child => ({ sessions: [workSession(isRunning)], files: { [reportPath(HOME, 'local_work')]: report } })

const bodyOf = async (ui: Mounted) => JSON.stringify(await textsOf(ui))

async function worker($: Engine, on: On, ids: string[] = [], spawned = 'b1', child: Child = childOf(NOW)) {
  const writes: { path: string; text: string }[] = []
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('skill.prompt', (_, e) => ({ text: e.text }))
  loops(on, ids, spawned)
  const run = world(on, child)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await run.clock.advance(1_000)
  const mine = () => writes.filter(one => one.path === reportPath(HOME, 'local_worker')).map(one => JSON.parse(one.text) as Report)
  return { run, writes, mine }
}

const invalidations = (on: On) => {
  const drawn = { count: 0 }
  on('ui.invalidate', (_, e, next) => {
    drawn.count += 1
    return next(e)
  })
  return drawn
}

warmUp()

test('AC1: a subagent holding Bash reads "Bash · 1s" on line 2 as three Texts after one tick', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, BASH)
  const ui = await pane($)
  await run.clock.advance(TICK_MS)
  expect(await lineOf(ui, 'a1')).toBe('Bash · 1s')
  expect(await has(ui, '--silent')).toBe(false)
  expect(await has(ui, 'npm test')).toBe(false)
  await end()
  await ui.unmount()
})

test('AC2: when the call ends the sub-line reads "running" again and no Text holds the command', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, BASH)
  const ui = await pane($)
  await run.clock.advance(TICK_MS)
  await end()
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-text')).toBe('running')
  expect(await labelOf(ui, 'row-a1-cmd-dot')).toBe('')
  expect(await has(ui, 'npm test')).toBe(false)
  await ui.unmount()
})

test('AC2: a call whose hook fails clears the command at once', async ($, on) => {
  const run = await master($, on)
  const ui = await pane($)
  await $.tool.call({ tool_use_id: 'toolu_boom', tool: 'Bash', command: 'boom', agentId: 'a1' } as unknown as Input).catch(() => undefined)
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-text')).toBe('running')
  expect(await has(ui, 'boom')).toBe(false)
  await ui.unmount()
})

test('AC3: a Read of a file under home reads "Read · ~/Work/app/x.ts · 0s" with the home folder drawn as ~', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, { tool: 'Read', file_path: '/home/me/Work/app/x.ts', agentId: 'a1' })
  const ui = await pane($)
  expect(await lineOf(ui, 'a1')).toBe('Read · ~/Work/app/x.ts · 0s')
  await end()
  await ui.unmount()
})

test('AC3: a WebFetch reads its host only', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, { tool: 'WebFetch', url: 'https://api.x.dev/v1?token=wf3secret', agentId: 'a1' })
  const ui = await pane($)
  expect(await lineOf(ui, 'a1')).toBe('WebFetch · api.x.dev · 0s')
  expect(await has(ui, 'wf3secret')).toBe(false)
  await end()
  await ui.unmount()
})

test('AC4: workflow agents show their own tools in the opened run card and the run row line is the same as without them', async ($, on) => {
  const run = await master($, on, ['w0', 'w1'])
  await $.agent.spawn({ ...SPAWN, description: 'scan a', subagentType: 'workflow-subagent', workflow: { runId: 'r1', agentIndex: 0 } })
  await $.agent.spawn({ ...SPAWN, description: 'scan b', subagentType: 'workflow-subagent', workflow: { runId: 'r1', agentIndex: 1 } })
  await $.tool.call({ tool: OPEN, expand: 'r1' })
  const quiet = await pane($)
  const before = await labelOf(quiet, 'top-r1-text')
  await quiet.unmount()
  const first = await hold($, run, { tool: 'Bash', command: 'ls -la /tmp', agentId: 'w0' })
  const second = await hold($, run, { tool: 'Grep', pattern: 'TODO', agentId: 'w1' })
  const ui = await pane($)
  expect(await lineOf(ui, 'w0')).toBe('Bash · 0s')
  expect(await lineOf(ui, 'w1')).toBe('Grep · 0s')
  expect([await has(ui, '/tmp'), await has(ui, 'TODO')]).toEqual([false, false])
  expect(await labelOf(ui, 'top-r1-text')).toBe(before)
  expect(before).toBe('scan b')
  await first.end()
  await second.end()
  await ui.unmount()
})

test('AC5: overlapping calls show the newest still running, then the older one, then "running"', async ($, on) => {
  const run = await master($, on)
  const bash = await hold($, run, { tool: 'Bash', command: 'sleep 5', agentId: 'a1' })
  await run.clock.advance(1_000)
  const read = await hold($, run, { tool: 'Read', file_path: '/home/me/x.ts', agentId: 'a1' })
  const ui = await pane($)
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-text')).toBe('Read · ~/x.ts')
  await read.end()
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-text')).toBe('Bash')
  await bash.end()
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-text')).toBe('running')
  await ui.unmount()
})

test('AC6: turn.complete for the loop before the call ends takes the agent out of Working and leaves no command in the pane', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, BASH)
  const ui = await pane($)
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-text')).toBe('Bash')
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', agentId: 'a1', reason: 'answer' })
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-cmd-elapsed')).toBe('')
  await end()
  await ui.unmount()
})

test('AC7: after a hot reload the sub-line reads "running" until the loop makes its next call', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, BASH)
  const ui = await pane($)
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-text')).toBe('Bash')
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-text')).toBe('running')
  const next = await hold($, run, { tool: 'Bash', command: 'ls', agentId: 'a1' })
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-text')).toBe('Bash')
  await next.end()
  await end()
  await ui.unmount()
})

test('AC8: the master’s own main loop is never shown', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, { tool: 'Bash', command: 'npm test' })
  const ui = await pane($)
  await run.clock.advance(TICK_MS)
  expect(await has(ui, 'npm test')).toBe(false)
  await end()
  await ui.unmount()
})

test('AC9: Agent, Workflow, AskUserQuestion and the mod’s own tools are not shown as commands, and a question shows the needs-you ask', async ($, on) => {
  const run = await master($, on)
  const ui = await pane($)
  const calls = [{ tool: 'Agent', description: 'x', prompt: 'x', subagent_type: 'Explore' }, { tool: 'Workflow', script: 'export const meta = { phases: [] }' }, { tool: OPEN }]
  for (const call of calls) {
    const held = await hold($, run, { ...call, agentId: 'a1' })
    await run.clock.advance(TICK_MS)
    expect([call.tool, await labelOf(ui, 'row-a1-cmd-elapsed')]).toEqual([call.tool, ''])
    await held.end()
  }
  const asking = await hold($, run, { tool: 'AskUserQuestion', questions: [{ question: 'Which branch?' }], agentId: 'a1' })
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'row-a1-cmd-elapsed')).toBe('')
  expect(await has(ui, 'Which branch?')).toBe(true)
  await asking.end()
  await ui.unmount()
})

test('AC10: the opened card holds a Running block with the tool and "since HH:MM · 1s", no command', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, BASH)
  await $.tool.call({ tool: OPEN, expand: 'a1' })
  const ui = await pane($)
  await run.clock.advance(TICK_MS)
  expect(await ui.find({ key: 'running-a1' })).toBeDefined()
  expect((await textsOf(ui)).map(String)).toContain('Bash')
  expect(await ui.find({ key: 'running-a1-text' })).toBeUndefined()
  expect(await has(ui, '--silent')).toBe(false)
  expect(await labelOf(ui, 'running-a1-since')).toBe(`since ${hhmm(NOW)} · 1s`)
  await end()
  await ui.unmount()
})

test('AC11: a chain reads just "Bash" on the row and in the card', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, { tool: 'Bash', command: 'cd /srv && git fetch origin && git rebase origin/main && bun test', agentId: 'a1' })
  await $.tool.call({ tool: OPEN, expand: 'a1' })
  const ui = await pane($)
  expect(await ui.find({ key: 'running-a1-text' })).toBeUndefined()
  expect(await labelOf(ui, 'top-a1-text')).toBe('Bash')
  expect([await has(ui, 'fetch'), await has(ui, 'rebase')]).toEqual([false, false])
  await end()
  await ui.unmount()
})

test('AC40: an array assignment reads just "Bash" on the row and in the card, and neither its secret nor mysql shows', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, { tool: 'Bash', command: 'ARGS=(--password X40) && mysql "${ARGS[@]}"', agentId: 'a1' })
  await $.tool.call({ tool: OPEN, expand: 'a1' })
  const ui = await pane($)
  expect(await lineOf(ui, 'a1', 'top')).toBe('Bash · 0s')
  expect(await ui.find({ key: 'running-a1-text' })).toBeUndefined()
  expect((await textsOf(ui)).map(String)).toContain('Bash')
  expect([await has(ui, 'mysql'), await has(ui, 'X40')]).toEqual([false, false])
  await end()
  await ui.unmount()
})

test('AC13: a running agent with no call has no Running block, "running" on its sub-line and no placeholder', async ($, on) => {
  const run = await master($, on)
  await $.tool.call({ tool: OPEN, expand: 'a1' })
  const ui = await pane($)
  await run.clock.advance(TICK_MS)
  expect(await ui.find({ key: 'running-a1' })).toBeUndefined()
  expect(await labelOf(ui, 'top-a1-text')).toBe('running')
  expect(await labelOf(ui, 'top-a1-cmd-dot')).toBe('')
  expect(await has(ui, 'Running')).toBe(false)
  await ui.unmount()
})

test('AC14: a worker writes running once at the start and once at the end of each allow-listed call, the MCP tool by name only', async ($, on) => {
  const { run, mine } = await worker($, on)
  const calls = [
    { input: { tool: 'Bash', command: 'npm test --silent' }, running: { tool: 'Bash' } },
    { input: { tool: 'WebFetch', url: 'https://x.dev/a?token=wf14' }, running: { tool: 'WebFetch', text: 'x.dev' } },
    { input: { tool: 'mcp__context7-local__query-docs', query: 'q-secret' }, running: { tool: 'mcp__context7-local__query-docs' } },
  ]
  for (const one of calls) {
    const before = mine().length
    const held = await hold($, run, one.input)
    const opened = mine().slice(before)
    expect(opened.length).toBe(1)
    expect(opened[0]?.running).toEqual({ ...one.running, since: expect.any(Number) })
    await held.end()
    const closed = mine().slice(before + 1)
    expect(closed.length).toBe(1)
    expect(closed[0]).not.toHaveProperty('running')
  }
  expect(['q-secret', '--silent', 'wf14'].map(word => JSON.stringify(mine()).includes(word))).toEqual([false, false, false])
})

test('AC14: a held call changes no report state, modelAt or now, and a turn end clears it from the report', async ($, on) => {
  const { run, mine } = await worker($, on)
  await $.tool.call({ tool: REPORT, state: 'waiting', now: 'idle' })
  const base = mine().at(-1)
  expect([base?.state, base?.now]).toEqual(['waiting', 'idle'])
  const held = await hold($, run, { tool: 'Bash', command: 'npm test' })
  const opened = mine().at(-1)
  expect([opened?.state, opened?.now, opened?.modelAt]).toEqual([base?.state, base?.now, base?.modelAt])
  expect(opened?.running?.tool).toBe('Bash')
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(mine().at(-1)).not.toHaveProperty('running')
  await held.end()
})

test('AC32: a worker’s Read, Grep and Glob write no report at all', async ($, on) => {
  const { run, mine } = await worker($, on)
  const before = mine().length
  for (const input of [{ tool: 'Read', file_path: '/home/me/x.ts' }, { tool: 'Grep', pattern: 'TODO' }, { tool: 'Glob', pattern: '*.ts' }]) {
    const held = await hold($, run, input)
    await held.end()
  }
  expect(mine().length).toBe(before)
})

test('AC15: a worker’s allow-listed call makes no git, process or ccd call from its start to its end', async ($, on) => {
  const { run } = await worker($, on)
  const before = [run.gits.length, run.calls.length]
  const held = await hold($, run, { tool: 'Bash', command: 'npm test' })
  await held.end()
  expect([run.gits.length, run.calls.length]).toEqual(before)
})

test('AC16: a worker’s subagent Bash writes running on its report agent once at the start and once at the end, and its Read writes nothing', async ($, on) => {
  const { run, mine } = await worker($, on, ['b1'])
  await $.agent.spawn({ ...SPAWN, description: 'Check one', subagentType: 'Explore' })
  await run.clock.settle()
  const before = mine().length
  const held = await hold($, run, { tool: 'Bash', command: 'ls', agentId: 'b1' })
  const opened = mine().slice(before)
  expect(opened.length).toBe(1)
  expect(opened[0]?.agents?.find(one => one.id === 'b1')?.running).toEqual({ tool: 'Bash', since: expect.any(Number) })
  await held.end()
  const closed = mine().slice(before + 1)
  expect(closed.length).toBe(1)
  expect(closed[0]?.agents?.find(one => one.id === 'b1')).not.toHaveProperty('running')
  const read = await hold($, run, { tool: 'Read', file_path: '/home/me/x.ts', agentId: 'b1' })
  await read.end()
  expect(mine().length).toBe(before + 2)
})

test('AC17: a Working worker row reads "Bash · 17s" from its report and keeps its step count', async ($, on) => {
  const run = await started($, on, WORK_BOARD, workChild(workReport()))
  const ui = await pane($)
  await run.clock.advance(FILE_MS)
  expect(await lineOf(ui, 'local_work')).toBe('Bash · 17s')
  expect(await altsOf(ui)).toContain('2 of 4')
  await ui.unmount()
})

test('AC18: when the report is rewritten without running the sub-line reads the step label again', async ($, on) => {
  const child = workChild(workReport())
  const run = await started($, on, WORK_BOARD, child)
  const ui = await pane($)
  await run.clock.advance(FILE_MS)
  expect(await labelOf(ui, 'row-local_work-text')).toBe('Bash')
  child.files = { ...child.files, [reportPath(HOME, 'local_work')]: workReport({ seq: 2, running: undefined }) }
  await run.clock.advance(FILE_MS)
  expect(await labelOf(ui, 'row-local_work-text')).toBe('build')
  await ui.unmount()
})

test('AC19: a worker the live list does not run shows no command', async ($, on) => {
  const run = await started($, on, WORK_BOARD, workChild(workReport(), false))
  const ui = await pane($)
  await run.clock.advance(FILE_MS)
  expect(await has(ui, 'npm test')).toBe(false)
  await ui.unmount()
})

test('AC19: a worker whose report says run.isRunning is false shows no command', async ($, on) => {
  const run = await started($, on, WORK_BOARD, workChild(workReport({ run: { isRunning: false } })))
  const ui = await pane($)
  await run.clock.advance(FILE_MS)
  expect(await has(ui, 'npm test')).toBe(false)
  await ui.unmount()
})

test('AC20: a worker’s report agent shows its own command and its elapsed', async ($, on) => {
  const agent = { id: 'b1', type: 'general-purpose', description: 'Check one', state: 'running', startedAt: NOW - 20_000, running: { tool: 'Bash', since: NOW - 2_000 } }
  const run = await started($, on, WORK_BOARD, workChild(workReport({ running: undefined, agents: [agent] })))
  const ui = await pane($)
  await run.clock.advance(FILE_MS)
  expect(await lineOf(ui, 'b1')).toBe('Bash · 7s')
  await ui.unmount()
})

test('AC21: a worker that needs you shows the ask and not its command', async ($, on) => {
  const run = await started($, on, WORK_BOARD, workChild(workReport({ state: 'needs-you', needsYou: 'Approve the push', modelAt: NOW })))
  await run.clock.advance(FILE_MS)
  await $.tool.call({ tool: OPEN, expand: 'local_work' })
  const ui = await pane($)
  expect(await has(ui, 'Approve the push')).toBe(true)
  expect(await has(ui, 'npm test')).toBe(false)
  expect(await ui.find({ key: 'running-local_work' })).toBeUndefined()
  await ui.unmount()
})

test('AC23: a master’s card, pane and agents state never hold the secrets of a held command', { plugins: [PROBE] }, async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, { tool: 'Bash', command: SECRET, agentId: 'a1' })
  await $.tool.call({ tool: OPEN, expand: 'a1' })
  const ui = await pane($)
  await run.clock.advance(TICK_MS)
  expect(await ui.find({ key: 'running-a1-text' })).toBeUndefined()
  expect(await labelOf(ui, 'top-a1-text')).toBe('Bash')
  const body = await bodyOf(ui)
  const state = JSON.stringify(await agentsOf($))
  expect(['curl', 'abc123', 'k123', 'api.x.dev'].flatMap(word => [body.includes(word), state.includes(word)])).toEqual([false, false, false, false, false, false, false, false])
  await end()
  await ui.unmount()
})

test('AC23: a worker’s written reports never hold the secrets of its held command', async ($, on) => {
  const { run, writes, mine } = await worker($, on)
  const held = await hold($, run, { tool: 'Bash', command: SECRET })
  expect(mine().at(-1)?.running).toEqual({ tool: 'Bash', since: expect.any(Number) })
  await held.end()
  const all = writes.map(one => one.text).join('\n')
  expect(['curl', 'abc123', 'k123', 'api.x.dev'].map(word => all.includes(word))).toEqual([false, false, false, false])
})

test('AC37: a WebSearch reads its tool name only', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, { tool: 'WebSearch', query: 'bun docs api_key=k37', agentId: 'a1' })
  const ui = await pane($)
  expect(await lineOf(ui, 'a1')).toBe('WebSearch · 0s')
  expect(await has(ui, 'k37')).toBe(false)
  await end()
  await ui.unmount()
})

test('AC39: a permission request for a command puts only "Allow Bash" in the pane and the band', { plugins: [PROBE] }, async ($, on) => {
  await master($, on)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'mysql -p hunter2' }, agent_id: 'a1' } as never)
  const ui = await pane($)
  expect(await has(ui, 'Allow Bash')).toBe(true)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const bandBody = JSON.stringify([await textsOf(band), await altsOf(band)])
  expect([await has(ui, 'mysql'), await has(ui, 'hunter2'), JSON.stringify(await agentsOf($)).includes('hunter2'), bandBody.includes('hunter2')]).toEqual([false, false, false, false])
  await band.unmount()
  await ui.unmount()
})

test('AC38: for every credential command, the master’s pane, card and ask hold no secret and no Bash text', { plugins: [PROBE] }, async ($, on) => {
  const run = await master($, on)
  await $.tool.call({ tool: OPEN, expand: 'a1' })
  const ui = await pane($)
  for (const [, command, secrets] of CREDENTIALS) {
    const held = await hold($, run, { tool: 'Bash', command, agentId: 'a1' })
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command }, agent_id: 'a1' } as never)
    const all = JSON.stringify([await textsOf(ui), await altsOf(ui)])
    expect(await ui.find({ key: 'running-a1-text' })).toBeUndefined()
    expect(secrets.filter(secret => all.includes(secret))).toEqual([])
    await held.end()
  }
  await ui.unmount()
})

test('AC38: for every credential command, a worker’s reports hold no secret and no Bash text', async ($, on) => {
  const { run, writes, mine } = await worker($, on)
  for (const [, command, secrets] of CREDENTIALS) {
    const before = mine().length
    const from = writes.length
    const held = await hold($, run, { tool: 'Bash', command })
    expect(mine().slice(before)[0]?.running).toEqual({ tool: 'Bash', since: expect.any(Number) })
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command } } as never)
    await held.end()
    const all = writes.slice(from).map(one => one.text).join('\n')
    expect(secrets.filter(secret => all.includes(secret))).toEqual([])
    expect(all).not.toContain('"text":"')
  }
})

async function costly($: Engine, on: On, isCalling: boolean) {
  const writes: string[] = []
  on('fs.write', (_, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  const run = await master($, on, ['a1'], workChild(workReport()), WORK_BOARD)
  const before = { gits: run.gits.length, calls: run.calls.length, scans: run.scans.messages, writes: writes.length }
  for (let index = 0; index < 20; index += 1) {
    const held = isCalling ? await hold($, run, { tool: index % 2 ? 'Read' : 'Bash', command: 'npm test', file_path: '/home/me/x.ts', agentId: 'a1' }) : undefined
    await run.clock.advance(isCalling ? 1_499 : 1_500)
    await held?.end()
  }
  return { gits: run.gits.length - before.gits, calls: run.calls.length - before.calls, scans: run.scans.messages - before.scans, writes: writes.length - before.writes }
}

let baseline: Awaited<ReturnType<typeof costly>> | undefined

test('AC24 baseline: the same run without calls', async ($, on) => {
  baseline = await costly($, on, false)
  expect(baseline.gits).toBeGreaterThan(0)
})

test('AC24: 20 calls over ten report reads make the same git, ccd and transcript calls as the run without them, and no master write', async ($, on) => {
  const withCalls = await costly($, on, true)
  expect(baseline).toBeDefined()
  expect(withCalls).toEqual(baseline)
})

test('AC25: a call makes no process, ccd or agent list call on the tool path', async ($, on) => {
  const run = await master($, on)
  await run.clock.advance(FILE_MS)
  const before = { ...counts, gits: run.gits.length, calls: run.calls.length }
  for (const input of [{ tool: 'Bash', command: 'ls', agentId: 'a1' }, { tool: 'Read', file_path: '/home/me/x.ts', agentId: 'a1' }, { tool: 'Grep', pattern: 'x', agentId: 'a1' }]) {
    const held = await hold($, run, input)
    await held.end()
  }
  expect({ ...counts, gits: run.gits.length, calls: run.calls.length }).toEqual(before)
})

test('AC26: a plain session shows no command, writes no file and makes no git or ccd call for a subagent’s call', async ($, on) => {
  const writes: string[] = []
  on('fs.write', (_, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  loops(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.agent.spawn({ ...SPAWN, description: 'Find callers', subagentType: 'Explore' })
  await $.tool.call({ tool: OPEN })
  await run.clock.settle()
  const before = [run.gits.length, run.calls.length, writes.length]
  const { end } = await hold($, run, BASH)
  const ui = await pane($)
  expect(await has(ui, 'Bash')).toBe(false)
  await end()
  expect([run.gits.length, run.calls.length, writes.length]).toEqual(before)
  await ui.unmount()
})

const boxesOf = (node: unknown): string[] =>
  Array.isArray(node) ? node.flatMap(boxesOf) : node && typeof node === 'object' ? [...(typeof (node as { key?: unknown }).key === 'string' ? [(node as { key: string }).key] : []), ...boxesOf((node as { children?: unknown }).children)] : []

async function shapeOf(ui: Mounted, band: Ui) {
  const boxes = await ui.findAll({ type: 'Box' })
  const keyed = boxes.filter(box => /^(chip-|block-|group-head-|section-chips|section-summary)/.test(box.key ?? ''))
  return {
    band: [await textsOf(band), await altsOf(band)],
    alts: await altsOf(ui),
    chips: keyed.map(box => [box.key, box.text]),
    groups: boxes.filter(box => /^group-rows-/.test(box.key ?? '')).map(box => [box.key, boxesOf(box.children).filter(key => /^row-[^-]+$/.test(key))]),
  }
}

test('AC27: no band Text or alt carries the command text (the tool name may show), and AC28: no chip, tile or row group changes and the band draws no working count', async ($, on) => {
  const child = workChild(workReport({ running: undefined }))
  const run = await master($, on, ['a1'], child, WORK_BOARD)
  await run.clock.advance(FILE_MS)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const ui = await pane($)
  const before = await shapeOf(ui, band)
  const held = await hold($, run, BASH)
  child.files = { ...child.files, [reportPath(HOME, 'local_work')]: workReport({ seq: 2 }) }
  await run.clock.advance(FILE_MS)
  expect(await lineOf(ui, 'local_work')).toContain('Bash')
  const after = await shapeOf(ui, band)
  expect(JSON.stringify(after.band)).not.toMatch(/npm|silent/)
  expect(after.chips).toEqual(before.chips)
  expect(after.groups).toEqual(before.groups)
  expect(after.alts.filter(alt => /^(Sessions|Needs you|Subagents|Workflows|Commits|Tests|Duration|Git) /.test(String(alt)))).toEqual(before.alts.filter(alt => /^(Sessions|Needs you|Subagents|Workflows|Commits|Tests|Duration|Git) /.test(String(alt))))
  expect((await band.findAll({ type: 'Text' })).some(one => /working/.test(String(one.text)))).toBe(false)
  expect(after.groups.length).toBeGreaterThan(0)
  await held.end()
  await band.unmount()
  await ui.unmount()
})

test('AC29: the board file and the reports tool answer carry no running key and no command text', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  const run = await master($, on, ['a1'], workChild(workReport()), WORK_BOARD)
  const held = await hold($, run, BASH)
  const mark = writes.length
  await $.tool.call({ tool: BOARD_TOOL, ...WORK_BOARD, sessions: [{ ...WORK_BOARD.sessions[0], now: 'building' }] })
  await run.clock.advance(LIVE_MS)
  const boards = writes.slice(mark).filter(one => one.path.includes('/boards/'))
  expect(boards.length).toBeGreaterThan(0)
  for (const one of boards) expect([one.text.includes('running'), one.text.includes('npm test')]).toEqual([false, false])
  const answer = (await $.tool.call({ tool: 'mcp__master-session__reports' })) as { result?: string }
  expect(String(answer.result)).not.toContain('running')
  expect(String(answer.result)).not.toContain('npm test')
  await held.end()
})

test('AC30: on the terminal the row tail reads "Bash · 1s" (one Text per row, the three pieces joined)', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, BASH)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await run.clock.advance(TICK_MS)
  expect((await textsOf(ui)).map(String).some(text => text.includes('Bash · 1s'))).toBe(true)
  await end()
  await ui.unmount()
})

test('AC31: on the terminal the opened detail holds one line "Running · Bash · since HH:MM"', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, BASH)
  await $.tool.call({ tool: OPEN, expand: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await run.clock.advance(TICK_MS)
  expect(await labelOf(ui, 'running-a1')).toBe(`Running · Bash · since ${hhmm(NOW)}`)
  await end()
  await ui.unmount()
})

test('AC34: under 340 px the sub-line drops the row’s own elapsed while a command shows and brings it back when the call ends', async ($, on) => {
  const run = await master($, on)
  const { end } = await hold($, run, BASH)
  await $.tool.call({ tool: OPEN, expand: 'a1' })
  const ui = await pane($, { bodyColumns: 40 })
  await run.clock.advance(TICK_MS)
  expect(await lineOf(ui, 'a1', 'top')).toBe('Bash · 1s')
  expect(await ui.find({ key: 'top-a1-elapsed-narrow' })).toBeUndefined()
  expect(await labelOf(ui, 'time-a1')).toContain('running 1s')
  await end()
  await run.clock.advance(TICK_MS)
  expect(await ui.find({ key: 'top-a1-elapsed-narrow' })).toBeDefined()
  await ui.unmount()
})

test('AC33: the tick redraws once per second while the command shows seconds, once a minute at minutes, and once when the call ends', async ($, on) => {
  const all: Record<string, unknown> = {
    agents: [{ id: 'a1', type: 'Explore', description: 'Find callers', prompt: 'go', task: { state: 'done', text: 'Finds callers.' }, state: 'running', startedAt: NOW - 120_000 }],
    workflows: [],
    live: { self: SELF, title: '', sessions: [], error: '', at: NOW - 600_000 },
  }
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key in all ? { value: { ...real.value, value: all[e.key] } } : real) as never
  })
  const drawn = invalidations(on)
  const run = await master($, on, [])
  const { end } = await hold($, run, BASH)
  const ui = await pane($)
  await run.clock.advance(TICK_MS)
  for (const second of [2, 3, 4, 5]) {
    const before = drawn.count
    await run.clock.advance(TICK_MS)
    expect([await lineOf(ui, 'a1'), drawn.count - before]).toEqual([`Bash · ${second}s`, 1])
  }
  await run.clock.advance(61_000)
  expect(await lineOf(ui, 'a1')).toBe('Bash · 1m')
  const quiet = drawn.count
  await run.clock.advance(5 * TICK_MS)
  expect(drawn.count - quiet).toBe(0)
  await end()
  const ended = drawn.count
  await run.clock.advance(TICK_MS)
  expect([drawn.count - ended, await labelOf(ui, 'row-a1-text')]).toEqual([1, 'running'])
  await run.clock.advance(5 * TICK_MS)
  expect(drawn.count - ended).toBe(1)
  await ui.unmount()
})

function seeded(on: On, values: Record<string, unknown>) {
  const all: Record<string, unknown> = { workflows: [], live: { self: SELF, title: '', sessions: [], error: '', at: NOW - 600_000 }, ...values }
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key in all ? { value: { ...real.value, value: all[e.key] } } : real) as never
  })
}

const FRESH = { id: 'a1', type: 'Explore', description: 'Find callers', prompt: 'go', state: 'running', startedAt: NOW - 120_000 }

async function redraws(run: Run, drawn: { count: number }, ticks: number) {
  await run.clock.advance(TICK_MS)
  const before = drawn.count
  await run.clock.advance(ticks * TICK_MS)
  return drawn.count - before
}

test('tick: the agents of a collapsed run do not redraw the pane while their seconds change', async ($, on) => {
  const old = { type: 'workflow-subagent', prompt: 'go', description: 'scan', startedAt: NOW - 3_000_000 }
  seeded(on, {
    agents: [
      { ...old, id: 'w0', state: 'done', endedAt: NOW - 2_000_000, run: { id: 'wf_1', index: 0 } },
      { ...old, id: 'w1', state: 'running', startedAt: NOW - 1_000, run: { id: 'wf_1', index: 1 } },
    ],
    workflows: [{ id: 'wf_1', toolUseId: 't', name: 'audit', phases: [], startedAt: NOW - 3_000_000 }],
  })
  const drawn = invalidations(on)
  const run = await started($, on)
  expect(await redraws(run, drawn, 3)).toBe(0)
})

test('tick: a chip-filtered item does not redraw the pane while its seconds change', async ($, on) => {
  seeded(on, { agents: [{ ...FRESH, startedAt: NOW - 1_000 }], filter: 'done' })
  const drawn = invalidations(on)
  const run = await started($, on)
  expect(await redraws(run, drawn, 3)).toBe(0)
})

test('tick: an open card redraws each second while its Time block shows seconds past a minute, and a closed one does not', async ($, on) => {
  seeded(on, { agents: [FRESH], expanded: 'a1' })
  const drawn = invalidations(on)
  const run = await started($, on)
  expect(await redraws(run, drawn, 3)).toBe(3)
})

test('tick: the same agent with its card closed redraws not at all past a minute', async ($, on) => {
  seeded(on, { agents: [FRESH] })
  const drawn = invalidations(on)
  const run = await started($, on)
  expect(await redraws(run, drawn, 3)).toBe(0)
})

const keysOf = async (ui: Mounted) => (await ui.findAll({ type: 'Box' })).map(box => box.key ?? '').filter(Boolean)

test('D3: the Running block comes first on an agent card, above Task, and on a session card above Now and Next', async ($, on) => {
  const run = await master($, on, ['a1'], workChild(workReport()), WORK_BOARD)
  const { end } = await hold($, run, BASH)
  await $.tool.call({ tool: OPEN, expand: 'a1' })
  const ui = await pane($)
  const agent = await keysOf(ui)
  expect(agent.indexOf('running-a1')).toBeGreaterThan(-1)
  expect(agent.indexOf('running-a1')).toBeLessThan(agent.indexOf('task-a1'))
  await $.tool.call({ tool: OPEN, expand: 'local_work' })
  await run.clock.advance(FILE_MS)
  const session = await keysOf(ui)
  expect(session.indexOf('running-local_work')).toBeGreaterThan(-1)
  expect(session.indexOf('running-local_work')).toBeLessThan(session.indexOf('pair-now-local_work'))
  await end()
  await ui.unmount()
})

const knownReport = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, kind: 'status', session: 'local_worker', engineId: 'engine-test', parent: 'local_master', seq: 5, at: NOW, run: { isRunning: false }, modelAt: NOW, state: 'working', activity: [], commits: [], tests: [], files: [], ...patch })

const reloaded = (report: string): Child => ({ ...childOf(NOW), files: { ...childOf(NOW).files, [reportPath(HOME, 'local_worker')]: report } })

test('AC32: after a reload a worker’s Read still writes no report', async ($, on) => {
  const { run, mine } = await worker($, on, [], 'b1', reloaded(knownReport()))
  const before = mine().length
  const held = await hold($, run, { tool: 'Read', file_path: '/home/me/x.ts' })
  await held.end()
  expect(mine().length).toBe(before)
})

test('AC18: after a reload a stale running in the worker’s own report is cleared by the first call, once', async ($, on) => {
  const { run, mine } = await worker($, on, [], 'b1', reloaded(knownReport({ running: { tool: 'Bash', since: 1 } })))
  const held = await hold($, run, { tool: 'Read', file_path: '/home/me/x.ts' })
  await held.end()
  expect(mine().length).toBe(1)
  expect(mine()[0]).not.toHaveProperty('running')
})

test('AC14: a report write that failed is retried by the next call, whatever its tool', async ($, on) => {
  const writes: string[] = []
  let isFailing = false
  on('fs.write', (_, e) => {
    if (isFailing) {
      isFailing = false
      throw new Error('disk')
    }
    writes.push(e.text)
    return { value: undefined }
  })
  on('skill.prompt', (_, e) => ({ text: e.text }))
  loops(on, [], 'b1')
  const run = world(on, childOf(NOW))
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await run.clock.advance(1_000)
  isFailing = true
  const held = await hold($, run, { tool: 'Bash', command: 'npm test' })
  const before = writes.length
  const read = await hold($, run, { tool: 'Read', file_path: '/home/me/x.ts' })
  await read.end()
  expect(writes.length).toBe(before + 1)
  expect(JSON.parse(writes.at(-1) ?? '{}').running?.tool).toBe('Bash')
  await held.end()
})

test('AC41: a seeded 400-character running.text of a WebFetch is cut on the master’s read-back, and a Bash text is dropped', async ($, on) => {
  const run = await started($, on, WORK_BOARD, workChild(workReport({ running: { tool: 'WebFetch', text: 'x'.repeat(400), since: NOW - 12_000 } })))
  const ui = await pane($)
  await run.clock.advance(FILE_MS)
  expect(await labelOf(ui, 'row-local_work-text')).toBe(`WebFetch · ${'x'.repeat(160)}…`)
  await ui.unmount()
})

test('AC41: a seeded Bash text in a report is never read back', async ($, on) => {
  const run = await started($, on, WORK_BOARD, workChild(workReport({ running: { tool: 'Bash', text: 'mysql Xk9wq2Lm', since: NOW - 12_000 } })))
  const ui = await pane($)
  await run.clock.advance(FILE_MS)
  expect(await lineOf(ui, 'local_work')).toBe('Bash · 17s')
  await ui.unmount()
})
