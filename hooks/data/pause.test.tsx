import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { HOLD, IDLE_PAUSE, PAUSE_HEAD, RESUME_HEAD } from '../lib/pause'
import type { Child } from '../testing/world'
import { AT, BOARD, BOARD_TOOL, HOME, PANE, SELF, SPAWN, WORKTREE, childOf, click, hitsOf, started, textsOf, typed, warmUp, world } from '../testing/world'

warmUp()

const PROBE = {
  name: 'pause-probe',
  register(on: On) {
    on('ui.render', { component: 'Pane', requestId: 'pause-probe' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>{JSON.stringify((await $.state.get({ plugin: 'master-session', key: 'pause' })).value ?? null)}</Text>
    })
  },
}

const WITH = { plugins: [PROBE] }

const RESTART = { cwd: HOME, surface: 'desktop', isInteractive: true } as const

const W3 = { sessionId: 'local_w3', name: 'third', title: 'Third worker', cwd: WORKTREE, isRunning: true, isArchived: false, lastActivityAt: AT, startedBy: SELF }

const PLAN = [
  { name: 'Parser', state: 'working' },
  { name: 'View', state: 'verifying' },
  { name: 'Docs', state: 'done' },
]

const BOARD3 = { ...BOARD, needsYou: [], plan: PLAN, sessions: [BOARD.sessions[0], BOARD.sessions[1], { id: 'local_w3', name: 'third', state: 'working', progress: 'step 1 of 3 — build', now: 'building' }] }

const sub = (id: string, status: AgentInfo['status'] = 'running'): AgentInfo => ({ id, description: `task ${id}`, type: 'general-purpose', status })

type Cfg = { listed: AgentInfo[]; afterAbort?: AgentInfo[]; decision: 'allow' | 'ask' | 'deny'; failTask: Set<string>; failStop: Set<string>; failSend: Set<string>; submit: 'ok' | 'drop' | 'reject' }

const COUNTED = new Set(['clock.every', 'clock.after', 'clock.sleep'])

async function setup($: Engine, on: On, init: Partial<Cfg> = {}, child: Child = { sessions: [W3] }) {
  const cfg: Cfg = { listed: [], decision: 'allow', failTask: new Set(), failStop: new Set(), failSend: new Set(), submit: 'ok', ...init }
  const log: string[] = []
  const prompts: string[] = []
  const timers = { every: 0, after: 0, sleep: 0 }
  let workflows = 0
  const spied = new Proxy(on, {
    apply(target, self, args: unknown[]) {
      const last = args.length - 1
      const handler = args[last]
      const name = String(args[0])
      if (typeof handler === 'function' && COUNTED.has(name)) {
        args[last] = (...inner: unknown[]) => {
          timers[name.slice(6) as keyof typeof timers] += 1
          return handler(...inner)
        }
      }
      if (typeof handler === 'function' && name === 'mcp.call') {
        args[last] = (...inner: unknown[]) => {
          const e = inner[1] as { tool: string; args: Record<string, unknown> }
          if (e.tool === 'stop_session' || e.tool === 'send_message') log.push(`${e.tool} ${String(e.args.session_id)}`)
          const failing = e.tool === 'stop_session' ? cfg.failStop : e.tool === 'send_message' ? cfg.failSend : undefined
          if (failing?.has(String(e.args.session_id))) return { value: { content: [{ type: 'text' as const, text: 'cannot' }], isError: true } }
          return handler(...inner)
        }
      }
      return Reflect.apply(target, self, args)
    },
  })
  on('agent.list', () => ({ value: cfg.listed }))
  on('agent.spawn', (_, e) => ({ model: 'claude-haiku-5-5', agentId: e.workflow ? `${e.workflow.runId}-${e.workflow.agentIndex}` : e.description }))
  on('tool.check', (_, e) => {
    if (e.tool !== 'TaskStop') return { decision: 'allow' as const }
    log.push(`check ${e.tool}`)
    return { decision: cfg.decision, reason: 'rule' }
  })
  on('tool.call', { tool: 'TaskStop' }, (_, e) => {
    log.push(`TaskStop ${String(e.task_id)}`)
    if (cfg.failTask.has(String(e.task_id))) return { deny: 'no such task' }
    return { result: { message: 'stopped', task_id: String(e.task_id), task_type: 'x' }, text: 'stopped' }
  })
  on('tool.call', { tool: 'Workflow' }, () => {
    workflows += 1
    return { result: { status: 'async_launched' as const, taskId: `task${workflows}`, taskType: 'local_workflow' as const, workflowName: 'review-changes', runId: `wf_${workflows}`, summary: 'Review' }, text: 'Workflow launched in background.' }
  })
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('classic.UserPromptSubmit', () => ({}))
  on('fs.write', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.abort', (_, e) => {
    log.push(`abort ${e.turnId}`)
    if (cfg.afterAbort) cfg.listed = cfg.afterAbort
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => {
    log.push(`prompt ${e.origin.kind}`)
    prompts.push(e.text)
    if (cfg.submit === 'reject') throw new Error('engine busy')
    return cfg.submit === 'drop' ? { drop: 'refused' } : { text: e.text }
  })
  const run = await started($, spied as On, BOARD3, child)
  const mount = () => $.ui.mount({ ...PANE, surface: 'desktop' })
  const press = async () => {
    const ui = await mount()
    await click(ui, 'hit-pause')
    await run.clock.settle()
    await ui.unmount()
  }
  const view = async () => {
    const ui = await mount()
    const seen = { texts: await textsOf(ui), hits: await hitsOf(ui) }
    await ui.unmount()
    return seen
  }
  const status = async () => (await view()).texts.find(text => /^(Pausing|Paused|Resuming)/.test(String(text))) ?? ''
  const workflow = async (agents: number) => {
    await $.tool.call({ tool: 'Workflow', script: "export const meta = { name: 'review-changes' }" })
    for (const index of [...Array(agents).keys()]) await $.agent.spawn({ ...SPAWN, description: `scan ${index}`, subagentType: 'workflow-subagent', workflow: { runId: `wf_${workflows}`, agentIndex: index } })
  }
  const turn = async (turnId: string, text: string, isAborted = false) => {
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted, turnId, reason: isAborted ? 'aborted' : 'answer' })
    await run.clock.settle()
  }
  const settle = (index = 0) => turn(`settle${index}`, prompts.at(-1) ?? '')
  const read = async () => {
    const ui = await $.ui.mount({ ...PANE, plugin: 'pause-probe', requestId: 'pause-probe', surface: 'terminal' })
    const found = await ui.find({ type: 'Text' })
    await ui.unmount()
    return JSON.parse(String(found?.text)) as unknown
  }
  return { ...run, cfg, log, prompts, timers, press, view, status, workflow, turn, settle, read }
}

const full = async ($: Engine, on: On, init: Partial<Cfg> = {}) => {
  const run = await setup($, on, { listed: [sub('a1'), sub('a2')], ...init })
  await run.workflow(2)
  await run.settle()
  await $.turn.start({ text: 'working on it', turnId: 'm1' })
  run.log.length = 0
  run.prompts.length = 0
  return run
}

test('AC1 the master header starts with Pause, before Ask and Refresh; a worker and a plain session show none', WITH, async ($, on) => {
  const run = await setup($, on)
  const { hits, texts } = await run.view()
  expect(hits.filter(hit => ['hit-pause', 'hit-ask', 'hit-refresh'].includes(hit))).toEqual(['hit-pause', 'hit-ask', 'hit-refresh'])
  expect(texts).toContain('Pause')
  expect(texts.indexOf('Pause')).toBeLessThan(texts.indexOf('Ask for updates'))
})

test('AC1 a stopped session draws its note and no Pause', WITH, async ($, on) => {
  const run = await setup($, on)
  await $.command.run(typed('master-session:stop', 'force'))
  await run.clock.settle()
  const { hits, texts } = await run.view()
  expect(hits).not.toContain('hit-pause')
  expect(texts).toEqual(['This session is not a master session: run /master-session:start to make it one.'])
})

test('AC1 a worker session draws its note and no Pause', WITH, async ($, on) => {
  on('fs.write', () => ({ value: undefined }))
  const run = world(on, childOf(3_600_000))
  await $.session.start(RESTART)
  await run.clock.advance(3_000)
  await $.tool.call({ tool: 'mcp__master-session__report', state: 'working', progress: 'step 1 of 2 — read' })
  await run.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await hitsOf(ui)).not.toContain('hit-pause')
  expect((await textsOf(ui)).join(' ')).toContain('This is a worker session of')
  await ui.unmount()
})

test('AC2 one press aborts the turn, stops everything, sends PAUSE, and only then submits one prompt', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  const at = (entry: string) => run.log.indexOf(entry)
  expect(run.log[0]).toBe('abort m1')
  for (const id of ['a1', 'a2', 'task1']) expect(run.log).toContain(`TaskStop ${id}`)
  for (const id of ['local_env', 'local_w3']) {
    expect(at(`stop_session ${id}`)).toBeGreaterThan(0)
    expect(at(`send_message ${id}`)).toBeGreaterThan(at(`stop_session ${id}`))
    expect(run.log.filter(entry => entry === `send_message ${id}`)).toHaveLength(1)
  }
  expect(run.log.filter(entry => entry.startsWith('prompt'))).toEqual(['prompt plugin'])
  expect(at('prompt plugin')).toBe(run.log.length - 1)
  expect(run.log.filter(entry => entry === 'check TaskStop').length).toBeGreaterThanOrEqual(3)
  expect(run.log.indexOf('check TaskStop')).toBeLessThan(run.log.indexOf('TaskStop a1'))
  expect(await run.read()).toEqual(expect.objectContaining({ state: 'pausing', agents: 3, sessions: 2 }))
})

test('AC3 an idle subagent and an idle board session get no call', WITH, async ($, on) => {
  const run = await full($, on, { listed: [sub('a1'), sub('a2'), sub('idle1', 'idle')] })
  await run.press()
  expect(run.log.some(entry => entry.includes('idle1') || entry.includes('local_setup'))).toBe(false)
})

test('AC4 a subagent is stopped and never messaged', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  expect(run.log.filter(entry => entry.startsWith('send_message') || entry.startsWith('send ')).some(entry => /a1|a2|task1|wf_1/.test(entry))).toBe(false)
  expect(run.calls.filter(call => call.tool === 'send_message').map(call => call.args.session_id).sort()).toEqual(['local_env', 'local_w3'])
})

test('AC5 one prompt names every stopped piece, the ledger, git status and the heartbeat stop', WITH, async ($, on) => {
  const run = await full($, on, { failTask: new Set(['a2']) })
  await run.press()
  expect(run.prompts).toHaveLength(1)
  const text = run.prompts[0] ?? ''
  expect(text.startsWith(PAUSE_HEAD)).toBe(true)
  for (const word of ['task a1', 'review-changes', 'env-e2e-test', 'third', 'task a2 (no such task)', 'ledger', 'git status --short', 'ScheduleWakeup with stop: true', 'background jobs and Monitors']) expect(text).toContain(word)
})

test('AC6 the status reads Pausing before the pause turn completes, then Paused in amber with Resume', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  expect(await run.status()).toBe('Pausing: stopping 3 agents and 2 sessions')
  expect((await run.view()).texts).toContain('Pause')
  await run.turn('m1', 'working on it', true)
  expect(await run.status()).toMatch(/^Pausing/)
  await run.settle()
  expect(await run.status()).toMatch(/^Paused at \d\d:\d\d · 2 pieces waiting$/)
  const { texts, hits } = await run.view()
  expect(texts).toContain('Resume')
  expect(texts).not.toContain('Pause')
  expect(hits).toContain('hit-pause')
})

test('AC7 a scheduled tick is dropped while paused; a composer prompt is not', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  await run.settle()
  const before = run.prompts.length
  const tick = await $.prompt.submit({ text: 'heartbeat tick', wait: false, origin: { kind: 'scheduled-trigger' } })
  const typedIn = await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  expect(tick).toEqual({ drop: HOLD })
  expect(typedIn).toEqual({ text: 'hello' })
  expect(run.prompts.slice(before)).toEqual(['hello'])
})

test('AC8 no Agent and no start_session while paused', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  for (const phase of ['pausing', 'paused']) {
    if (phase === 'paused') await run.settle()
    const spawned = await $.agent.spawn({ ...SPAWN, description: 'sneaky', subagentType: 'general-purpose' })
    expect(spawned).toEqual({ deny: HOLD })
    expect(HOLD).toContain('Resume')
    const session = await $.tool.call({ tool: 'mcp__ccd_session__start_session', prompt: 'go' })
    expect(JSON.stringify(session)).toContain('press Resume')
  }
})

test('AC9 Resume allows spawns at once, submits one resume prompt, and the next turn restores the status', WITH, async ($, on) => {
  const run = await full($, on)
  const before = await run.status()
  await run.press()
  await run.settle()
  expect(await run.status()).toMatch(/^Paused at/)
  run.prompts.length = 0
  await run.press()
  expect(await run.status()).toBe('Resuming')
  expect(await $.agent.spawn({ ...SPAWN, description: 'fresh', subagentType: 'general-purpose' })).toEqual(expect.objectContaining({ agentId: 'fresh' }))
  expect(run.prompts).toHaveLength(1)
  expect(run.prompts[0]?.startsWith(RESUME_HEAD)).toBe(true)
  expect(run.prompts[0]).toContain('RESUME')
  await run.settle(1)
  const { texts } = await run.view()
  expect(texts).toContain('Pause')
  expect(texts.some(text => /^(Pausing|Paused|Resuming)/.test(String(text)))).toBe(false)
  expect(await run.read()).toEqual(IDLE_PAUSE)
  expect(before).toBe('')
})

test('AC10 pause and resume add no clock.every, clock.after or clock.sleep, and no animation', WITH, async ($, on) => {
  const run = await full($, on)
  const base = { ...run.timers }
  await run.press()
  await run.settle()
  await run.press()
  await run.settle(1)
  expect(run.timers).toEqual(base)
  await run.press()
  await run.settle(2)
  const idle = { ...run.timers }
  await run.clock.advance(60_000)
  const paused = { every: run.timers.every - idle.every, after: run.timers.after - idle.after, sleep: run.timers.sleep - idle.sleep }
  await run.press()
  await run.settle(3)
  const armed = { ...run.timers }
  await run.clock.advance(60_000)
  const resumed = { every: run.timers.every - armed.every, after: run.timers.after - armed.after, sleep: run.timers.sleep - armed.sleep }
  expect(paused).toEqual(resumed)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (const one of await ui.findAll({ type: 'Svg' })) expect(String(one.props.source)).not.toContain('<animate')
  await ui.unmount()
})

test('AC11 one stop fails: the others stop, one toast, the prompt lists it, the status says 1 still running', WITH, async ($, on) => {
  const run = await full($, on, { listed: [sub('a1'), sub('a2'), sub('a3')], failTask: new Set(['a2']) })
  await run.press()
  await run.settle()
  for (const id of ['a1', 'a3', 'task1']) expect(run.log).toContain(`TaskStop ${id}`)
  expect(run.toasts).toEqual(["Couldn't stop task a2: no such task"])
  expect(run.prompts[0]).toContain('Failed: task a2 (no such task)')
  expect(await run.status()).toMatch(/^Paused at \d\d:\d\d · 2 pieces waiting · 1 still running$/)
  expect(await run.read()).toEqual(expect.objectContaining({ failed: ['task a2'] }))
  expect((await $.agent.spawn({ ...SPAWN, description: 'x', subagentType: 'general-purpose' })).deny).toBe(HOLD)
})

test('a TaskStop the check would ask about is a failure and opens no dialog', WITH, async ($, on) => {
  const run = await full($, on, { decision: 'ask' })
  await run.press()
  expect(run.log.some(entry => entry.startsWith('TaskStop'))).toBe(false)
  expect(run.toasts.filter(text => text.startsWith("Couldn't stop"))).toHaveLength(3)
  expect(run.toasts[0]).toContain('ask the master to stop it')
  expect(run.prompts[0]).toContain('stop any that failed yourself')
  await run.settle()
  expect(await run.status()).toMatch(/ · 3 still running$/)
})

test('a failed stop_session sends no PAUSE; a failed PAUSE is toasted; both reach the prompt', WITH, async ($, on) => {
  const run = await full($, on, { failStop: new Set(['local_env']), failSend: new Set(['local_w3']) })
  await run.press()
  expect(run.log).toContain('stop_session local_env')
  expect(run.log).not.toContain('send_message local_env')
  expect(run.log).toContain('send_message local_w3')
  expect(run.toasts).toEqual(expect.arrayContaining(["Couldn't stop env-e2e-test: cannot", 'third is stopped but did not get PAUSE; its Monitors may wake it.']))
  expect(run.prompts[0]).toContain('env-e2e-test (cannot)')
  expect(run.prompts[0]).toContain('third (stopped, but PAUSE not delivered)')
  await run.settle()
  expect(await run.status()).toMatch(/ · 1 still running$/)
})

test('AC12 a refused prompt still pauses, says the ledger is unwritten and toasts once', WITH, async ($, on) => {
  const dropped = await full($, on, { submit: 'drop' })
  await dropped.press()
  expect(await dropped.status()).toBe('Paused · ledger not written: type pause in the chat')
  expect(dropped.log).toContain('TaskStop a1')
  expect(dropped.toasts).toHaveLength(1)
  expect((await dropped.view()).texts).toContain('Resume')
})

test('AC12 a rejected prompt does the same', WITH, async ($, on) => {
  const run = await full($, on, { submit: 'reject' })
  await run.press()
  expect(await run.status()).toBe('Paused · ledger not written: type pause in the chat')
  expect(run.toasts).toHaveLength(1)
  expect(run.log).toContain('TaskStop a2')
})

test('AC13 a second press while pausing records nothing', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  const before = [run.log.length, run.calls.length, run.toasts.length, run.prompts.length]
  await run.press()
  await run.press()
  expect([run.log.length, run.calls.length, run.toasts.length, run.prompts.length]).toEqual(before)
  expect(await run.status()).toMatch(/^Pausing/)
})

test('AC14 stop clears the pause with the board, and a new board shows Pause', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  await run.settle()
  expect(await run.read()).toEqual(expect.objectContaining({ state: 'paused' }))
  await $.command.run(typed('master-session:stop', 'force'))
  await run.clock.settle()
  expect(await run.read()).toEqual(IDLE_PAUSE)
  await $.skill.prompt({ skill: 'master-session:start', text: 'Validator.', frontmatter: {}, source: 'plugin' })
  await run.clock.settle()
  await $.tool.call({ tool: BOARD_TOOL, ...(BOARD3 as typeof BOARD) })
  await run.clock.settle()
  expect((await run.view()).texts).toContain('Pause')
})

test('AC15 the pause survives a reload, guards included, and a main-loop turn settles a pausing state', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  await run.settle()
  await $.session.start(RESTART)
  await run.clock.settle()
  expect(await run.status()).toMatch(/^Paused at/)
  expect((await run.view()).texts).toContain('Resume')
  expect((await $.agent.spawn({ ...SPAWN, description: 'x', subagentType: 'general-purpose' })).deny).toBe(HOLD)
})

test('AC15 after a reload any main-loop turn.complete settles pausing', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  expect(await run.status()).toMatch(/^Pausing/)
  await $.session.start(RESTART)
  await run.clock.settle()
  await run.turn('other', 'anything')
  expect(await run.status()).toMatch(/^Paused at/)
})

test('the aborted turn does not settle the pause; the next main-loop turn does', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  await run.turn('m1', 'working on it', true)
  expect(await run.status()).toMatch(/^Pausing/)
  await run.turn('typed1', 'what is going on?')
  expect(await run.status()).toMatch(/^Paused at/)
})

test('the pause turn settles even when its text does not start with the head', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  await run.turn('framed1', `The plugin sent a message: ${run.prompts.at(-1) ?? ''}`)
  expect(await run.status()).toMatch(/^Paused at/)
  await run.press()
  await run.turn('framed2', 'something else')
  expect(await run.status()).toBe('')
})

test('a subagent that the abort already stopped gets no TaskStop and no failure', WITH, async ($, on) => {
  const run = await full($, on, { listed: [sub('a1'), sub('a2')], afterAbort: [sub('a1', 'killed'), sub('a2')], failTask: new Set(['a1']) })
  await run.press()
  await run.settle()
  expect(run.log).not.toContain('TaskStop a1')
  expect(run.log).toContain('TaskStop a2')
  expect(run.toasts).toEqual([])
  expect(run.prompts[0]).toContain('Failed: none')
  expect(await run.status()).toMatch(/^Paused at \d\d:\d\d · 2 pieces waiting$/)
})

test('a plain pane with a foreign running session draws no Pause and touches nothing', WITH, async ($, on) => {
  const log: string[] = []
  on('agent.list', () => ({ value: [] }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('turn.abort', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    log.push('prompt')
    return { text: e.text }
  })
  const run = world(on, { isBare: true, sessions: [{ sessionId: 'local_foreign', name: 'unrelated', title: 'Someone else chat', cwd: '/elsewhere', isRunning: true, isArchived: false, lastActivityAt: AT }] })
  await $.session.start(RESTART)
  await run.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-refresh')
  await run.clock.settle()
  expect(await hitsOf(ui)).not.toContain('hit-pause')
  await ui.unmount()
  expect(run.calls.filter(one => one.tool === 'stop_session' || one.tool === 'send_message')).toEqual([])
  expect(log).toEqual([])
})

test('a board master never stops a foreign running session', WITH, async ($, on) => {
  const foreign = { sessionId: 'local_foreign', name: 'unrelated', title: 'Someone else chat', cwd: '/elsewhere', isRunning: true, isArchived: false, lastActivityAt: AT }
  const run = await setup($, on, {}, { sessions: [W3, foreign] })
  await run.press()
  expect(run.log).toContain('stop_session local_w3')
  expect(run.log.some(entry => entry.includes('local_foreign'))).toBe(false)
})

test('reading the pause atom fails while paused: spawn and start_session stay denied', WITH, async ($, on) => {
  let isBroken = false
  on('state.get', async (_, e, next) => {
    if (isBroken && e.key === 'pause') throw new Error('state down')
    return next(e)
  })
  const run = await full($, on)
  await run.press()
  await run.settle()
  isBroken = true
  expect((await $.agent.spawn({ ...SPAWN, description: 'x', subagentType: 'general-purpose' })).deny).toBe(HOLD)
  expect(JSON.stringify(await $.tool.call({ tool: 'mcp__ccd_session__start_session', prompt: 'go' }))).toContain('press Resume')
  isBroken = false
})

test('a subagent turn ending never settles the pause', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 'sub-turn', agentId: 'a1', reason: 'answer' })
  await run.clock.settle()
  expect(await run.status()).toMatch(/^Pausing/)
})

test('a rejected resume prompt goes back to paused with the guards on', WITH, async ($, on) => {
  const run = await full($, on)
  await run.press()
  await run.settle()
  run.cfg.submit = 'reject'
  await run.press()
  expect(run.toasts.at(-1)).toMatch(/^Couldn't resume: /)
  expect(await run.status()).toMatch(/^Paused at/)
  expect((await $.agent.spawn({ ...SPAWN, description: 'x', subagentType: 'general-purpose' })).deny).toBe(HOLD)
})

test('nothing running: only the prompt is sent and the state reaches paused', WITH, async ($, on) => {
  const run = await setup($, on, {}, { isBare: true })
  await run.press()
  expect(run.log).toEqual(['prompt plugin'])
  expect(run.log.filter(entry => entry.startsWith('prompt'))).toEqual(['prompt plugin'])
  await run.settle()
  expect(await run.status()).toMatch(/^Paused at/)
})

test('no secrets reach the prompt or a toast', WITH, async ($, on) => {
  const run = await full($, on, { failTask: new Set(['a1']) })
  await $.agent.spawn({ ...SPAWN, description: 'secret holder', prompt: 'xyz-secret in the prompt', subagentType: 'general-purpose' })
  await $.tool.call({ tool: 'Bash', command: 'API_KEY=xyz-secret sleep 60', run_in_background: true }).catch(() => undefined)
  await run.press()
  expect(JSON.stringify([run.prompts, run.toasts])).not.toContain('xyz-secret')
})
