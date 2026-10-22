import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BAND, BOARD, HOME, MASTER, PANE, altsOf, hitsOf, started, textsOf, world } from '../testing/world'
import type { Report } from './contract'
import { promptTextOf } from './recorder'
import { reportPath } from './status'

const WORKER = reportPath(HOME, 'local_worker')

function worker(on: On) {
  const written: Report[] = []
  on('fs.write', (_, e) => {
    if (e.path === WORKER) written.push(JSON.parse(e.text) as Report)
    return { value: undefined }
  })
  const run = world(on, { parent: MASTER })
  const last = () => written.at(-1)
  return { ...run, written, last }
}

const start = async ($: Engine, run: ReturnType<typeof worker>) => {
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  await $.tool.call({ tool: 'mcp__master-session__report', state: 'working', progress: 'step 2 of 4 — build' })
  expect(run.last()?.state).toBe('working')
}

test('the needs-you text names the tool and its command or path, or the first question asked', () => {
  expect(promptTextOf('Bash', { command: 'rm -rf build', description: 'Remove build' })).toBe('Allow Bash: rm -rf build')
  expect(promptTextOf('Edit', { file_path: '/repo/a.ts' })).toBe('Allow Edit: /repo/a.ts')
  expect(promptTextOf('mcp__x__y', {})).toBe('Allow mcp__x__y')
  expect(promptTextOf('AskUserQuestion', { questions: [{ question: 'Which branch?' }, { question: 'Second?' }] })).toBe('Which branch?')
  expect(promptTextOf('AskUserQuestion', {})).toBe('Answer the question in the chat')
  expect(promptTextOf('Bash', { command: 'x'.repeat(300) }).length).toBe('Allow Bash: '.length + 160)
})

test('a permission request turns the worker report needs-you with the tool and command; the tool running turns it back to working', async ($, on) => {
  const run = worker(on)
  let whileWaiting: Report | undefined
  on('classic.PermissionRequest', () => ({}))
  on('tool.call', { tool: 'Bash' }, () => {
    whileWaiting = run.last()
    return { result: { stdout: '', stderr: '', interrupted: false }, text: '' }
  })
  await start($, run)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } })
  expect([run.last()?.state, run.last()?.needsYou, run.last()?.waits?.on]).toEqual(['needs-you', 'Allow Bash: rm -rf build', 'you'])
  const askedAt = run.last()?.modelAt ?? 0
  expect(askedAt).toBeGreaterThan(0)
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect(whileWaiting?.state).toBe('needs-you')
  expect([run.last()?.state, run.last()?.needsYou, run.last()?.waits]).toEqual(['working', undefined, undefined])
  expect(run.last()?.progress).toEqual({ step: 2, of: 4, label: 'build' })
})

test('an AskUserQuestion turns the report needs-you with the question while it waits, and its answer turns it back to working', async ($, on) => {
  const run = worker(on)
  let whileWaiting: Report | undefined
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    whileWaiting = run.last()
    return { result: { questions: [], answers: { 'Which branch?': 'main' } }, text: 'answered' } as never
  })
  await start($, run)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Which branch?', header: 'Branch', multiSelect: false, options: [{ label: 'main', description: '' }, { label: 'dev', description: '' }] }] })
  expect([whileWaiting?.state, whileWaiting?.needsYou]).toEqual(['needs-you', 'Which branch?'])
  expect([run.last()?.state, run.last()?.needsYou]).toEqual(['working', undefined])
})

test("a waiting prompt's notification marks needs-you when nothing else did, its answer clears it; a worker's own needs-you survives a prompt", async ($, on) => {
  const run = worker(on)
  on('classic.Notification', () => ({}))
  on('classic.PermissionRequest', () => ({}))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
  await start($, run)
  await $.classic.Notification({ message: 'Server x needs your input', notification_type: 'elicitation_dialog' })
  expect([run.last()?.state, run.last()?.needsYou]).toEqual(['needs-you', 'Server x needs your input'])
  await $.classic.Notification({ message: 'done', notification_type: 'elicitation_response' })
  expect([run.last()?.state, run.last()?.needsYou]).toEqual(['working', undefined])
  await $.classic.Notification({ message: 'idle', notification_type: 'idle_prompt' })
  expect(run.last()?.state).toBe('working')
  await $.tool.call({ tool: 'mcp__master-session__report', state: 'needs-you', needsYou: 'Pick the design' })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } })
  expect(run.last()?.needsYou).toBe('Allow Bash: ls')
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect([run.last()?.state, run.last()?.needsYou]).toEqual(['needs-you', 'Pick the design'])
})

test('a needs-you report reaches the master: within one FILE_MS refresh its row is pinned red with Open chat and the band names it', async ($, on) => {
  const board = { ...BOARD, sessions: [{ ...BOARD.sessions[0], state: 'working', needsYou: undefined }, BOARD.sessions[1]] }
  const report: Report = {
    v: 1,
    kind: 'status',
    session: 'local_setup',
    engineId: 'engine-setup',
    parent: 'local_validator',
    seq: 5,
    at: 3_590_000,
    run: { isRunning: true, since: 3_500_000 },
    modelAt: 3_590_000,
    state: 'working',
    activity: [],
    commits: [],
    tests: [],
    files: [],
  }
  const files: Record<string, string> = { [reportPath(HOME, 'local_setup')]: JSON.stringify(report) }
  const run = await started($, on, board, { files })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const heads = async () => (await ui.findAll({ type: 'Box' })).flatMap(box => (box.key?.startsWith('group-head-') ? [box.key] : []))
  expect(await heads()).toEqual(['group-head-working', 'group-head-waiting', 'group-head-archived'])
  files[reportPath(HOME, 'local_setup')] = JSON.stringify({ ...report, seq: 6, at: 3_601_000, modelAt: 3_601_000, state: 'needs-you', needsYou: 'Allow Bash: rm -rf build', waits: { since: 3_601_000, on: 'you' } })
  await run.clock.advance(3_000)
  expect((await heads())[0]).toBe('group-head-needs-you')
  expect(await textsOf(ui)).toContain('Allow Bash: rm -rf build')
  expect((await ui.find({ key: 'row-local_setup' }))?.props.borderColor).toBe('error')
  expect(await hitsOf(ui)).toContain('hit-chat-local_setup')
  await ui.unmount()
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await altsOf(band)).some(alt => String(alt).includes('setup-ui-redo needs you, Allow Bash: rm -rf build'))).toBe(true)
  await band.unmount()
  files[reportPath(HOME, 'local_setup')] = JSON.stringify({ ...report, seq: 7, at: 3_604_000, modelAt: 3_604_000, state: 'working' })
  await run.clock.advance(3_000)
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await hitsOf(after)).not.toContain('hit-chat-local_setup')
  await after.unmount()
})
