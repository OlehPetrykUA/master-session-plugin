import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BOARD, BOARD_TOOL, HOME, SELF, SPAWN, started, typed, warmUp, world } from '../testing/world'

warmUp()

const START = { skill: 'master-session:start', text: 'Validator.', frontmatter: {}, source: 'plugin' } as const

function counted(on: On) {
  const scans = { agents: 0 }
  on('agent.list', () => {
    scans.agents += 1
    return { value: [] }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('classic.PermissionRequest', () => ({}))
  on('classic.Notification', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  on('prompt.attachment', (_, e) => ({ text: e.text }))
  return scans
}

const PROMPT = (mode: string) => ({ prompt: 'go', permission_mode: mode }) as never

const sessionCalls = (run: { calls: { tool: string; args: Record<string, unknown> }[] }) => run.calls.filter(one => one.tool !== 'send_message')

async function turns($: Engine) {
  await $.agent.spawn({ ...SPAWN, description: 'Docs lookup', subagentType: 'Explore' })
  for (const turnId of ['t1', 't2']) {
    await $.turn.start({ turnId, text: 'go' } as never)
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } } as never)
    await $.classic.Notification({ notification_type: 'permission_prompt', message: 'Allow Bash' } as never)
    await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
  }
  await $.turn.start({ turnId: 's1', text: 'sub', agentId: 'a1' } as never)
  await $.turn.complete({ answer: 'sub', durationMs: 5, isAborted: false, turnId: 's1', agentId: 'a1', reason: 'answer' })
}

test('a plain session that runs subagents and turns makes no session call, no transcript scan and no agent poll', async ($, on) => {
  const scans = counted(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await turns($)
  await run.clock.advance(120_000)
  expect([run.calls.length, run.scans.messages, scans.agents, run.gits.length]).toEqual([0, 0, 0, 0])
})

test('a master reads get_session self once, whatever the events', async ($, on) => {
  const scans = counted(on)
  const run = await started($, on)
  await turns($)
  await run.clock.advance(60_000)
  expect(run.calls.filter(one => one.tool === 'get_session' && one.args.session_id === 'self')).toHaveLength(1)
  expect(scans.agents).toBeGreaterThan(0)
})

test('/master-session:start in a plain session starts the session reads and the agent poll', async ($, on) => {
  const scans = counted(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.skill.prompt(START)
  await run.clock.advance(15_000)
  expect(run.calls.some(one => one.tool === 'list_sessions')).toBe(true)
  expect(scans.agents).toBeGreaterThan(0)
})

test('the master asks the app for nothing in plan mode and picks up again when plan mode ends', async ($, on) => {
  counted(on)
  const run = await started($, on)
  await run.clock.advance(15_000)
  const before = sessionCalls(run).length
  await $.classic.UserPromptSubmit(PROMPT('plan'))
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await $.turn.complete({ answer: 'plan', durationMs: 5, isAborted: false, turnId: 'p1', reason: 'answer' })
  await run.clock.advance(120_000)
  expect(sessionCalls(run).length).toBe(before)
  await $.classic.UserPromptSubmit(PROMPT('default'))
  await run.clock.advance(15_000)
  expect(sessionCalls(run).length).toBeGreaterThan(before)
})

test('plan mode also follows the engine’s plan attachments', async ($, on) => {
  counted(on)
  const run = await started($, on)
  await run.clock.advance(15_000)
  const before = sessionCalls(run).length
  const note = (type: string) => ({ type, text: 'x', origin: { kind: 'engine' } }) as never
  await $.prompt.attachment(note('plan_mode'))
  await run.clock.advance(120_000)
  expect(sessionCalls(run).length).toBe(before)
  await $.prompt.attachment(note('plan_mode_exit'))
  await run.clock.advance(15_000)
  expect(sessionCalls(run).length).toBeGreaterThan(before)
})

test('a forced refresh still asks in plan mode', async ($, on) => {
  counted(on)
  const run = await started($, on)
  await $.classic.UserPromptSubmit(PROMPT('plan'))
  await run.clock.advance(15_000)
  const before = sessionCalls(run).length
  await $.command.run(typed('master-session:info', ''))
  await run.clock.settle()
  expect(sessionCalls(run).length).toBeGreaterThan(before)
})

test('a plain session whose subagent preloads the worker skill stays quiet: no scan, poll or git, at most one role lookup', async ($, on) => {
  const scans = counted(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await turns($)
  await run.clock.advance(120_000)
  expect([run.calls.filter(one => one.tool !== 'get_session' || one.args.session_id !== 'self').length, run.calls.length <= 1, run.scans.messages, scans.agents, run.gits.length]).toEqual([0, true, 0, 0, 0])
})

test('a successful ExitPlanMode ends plan mode for the background reads', async ($, on) => {
  counted(on)
  on('tool.call', { tool: 'ExitPlanMode' }, () => ({ result: 'ok', text: 'ok' }))
  const run = await started($, on)
  await run.clock.advance(15_000)
  await $.classic.UserPromptSubmit(PROMPT('plan'))
  await run.clock.advance(60_000)
  const before = sessionCalls(run).length
  await $.tool.call({ tool: 'ExitPlanMode' })
  await run.clock.advance(15_000)
  expect(sessionCalls(run).length).toBeGreaterThan(before)
})

test('/master-session:start writes the master’s board file at once, so a worker started next finds it', async ($, on) => {
  counted(on)
  const writes: string[] = []
  on('fs.write', (_, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await $.classic.UserPromptSubmit(PROMPT('plan'))
  await $.skill.prompt(START)
  await run.clock.settle()
  expect(writes).toContain(`${HOME}/.claude/state/master-session/boards/${SELF}.json`)
})

test('a plan-mode master that reloads makes no session call and stays out of the app until plan mode ends', async ($, on) => {
  counted(on)
  const run = await started($, on)
  await $.classic.UserPromptSubmit(PROMPT('plan'))
  await run.clock.advance(15_000)
  const before = run.calls.length
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(120_000)
  expect(run.calls.length).toBe(before)
})

test('a plain session that reloads stays as quiet as before: no call, scan, poll or git', async ($, on) => {
  const scans = counted(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await turns($)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await run.clock.advance(120_000)
  expect([run.calls.length, run.scans.messages, scans.agents, run.gits.length]).toEqual([0, 0, 0, 0])
})

const selfLookups = (run: { calls: { tool: string; args: Record<string, unknown> }[] }) => run.calls.filter(one => one.tool === 'get_session' && one.args.session_id === 'self').length

test('an unclaimed master that reloads in plan mode makes no role lookup when the pane is opened', async ($, on) => {
  counted(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.command.run(typed('master-session:info', ''))
  await run.clock.settle()
  await $.classic.UserPromptSubmit(PROMPT('plan'))
  const before = selfLookups(run)
  expect(before).toBe(1)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await $.command.run(typed('master-session:info', ''))
  await run.clock.settle()
  expect(selfLookups(run)).toBe(before)
})

test('a child of a plain chat that reloads stays quiet: no write, scan, poll or git, and no master session for its reports', async ($, on) => {
  const scans = counted(on)
  const writes: string[] = []
  on('fs.write', (_, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  const run = world(on, { parent: 'local_plain', isPaneOpen: true })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await run.clock.settle()
  const before = run.calls.length
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(120_000)
  const answer = (await $.tool.call({ tool: 'mcp__master-session__report', state: 'working' })) as { deny?: string }
  expect(String(answer.deny)).toContain('no master session')
  expect([run.calls.length, writes, run.scans.messages, scans.agents, run.gits.length]).toEqual([before, [], 0, 0, 0])
})
