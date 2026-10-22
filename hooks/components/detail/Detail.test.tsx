import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { across } from '../../lib/layout'
import { AT, BOARD, HOME, PANE, SELF, SPAWN, TOOLKIT, WORKTREE, click, hitsOf, started, textsOf } from '../../testing/world'
import type { Ui } from '../../testing/world'

const CONDUCTOR = { sessionId: 'local_conductor', name: 'conductor-redo', title: 'Conductor redo', cwd: `${HOME}/dotfiles`, isRunning: false, isArchived: false, lastActivityAt: AT, startedBy: SELF }

const DONE_BOARD = {
  ...BOARD,
  sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'done', progress: 'step 5 of 5 — merged' }, { id: 'local_conductor', name: 'conductor-redo', state: 'done', progress: 'step 5 of 5 — merged' }],
}

const BASE = { [`${WORKTREE} symbolic-ref`]: 'origin/main\n', [`${WORKTREE} rev-parse`]: 'd575596\n' }

const UNMERGED = { git: { ...BASE, [`${WORKTREE} rev-list`]: '2\n' }, sessions: [CONDUCTOR] }

const CLEAN = `${HOME}/.claude/worktrees/wt-toolkit-clean`

const TREES = (main: string) =>
  `worktree ${TOOLKIT}\nHEAD d575596be1713c300bf1d8737355ceda0cb3ded3\n${main}\n\nworktree ${WORKTREE}\nHEAD 0a4621c5737c70d482f20e7ea07591e9c117d6a1\ndetached\n\nworktree ${CLEAN}\nHEAD 1111111aaaaaaa\nbranch refs/heads/feat/clean\n\n`

const session = (sessionId: string, name: string, cwd: string) => ({ sessionId, name, title: name, cwd, isRunning: false, isArchived: false, lastActivityAt: AT, startedBy: SELF })

const finished = (id: string) => ({ id, name: id, state: 'done', progress: 'step 2 of 2 — merged' })

const doneOf = (...ids: string[]) => ({ ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'done' }, ...ids.map(finished)] })

const revList = (gits: readonly string[][], path: string) => gits.filter(argv => argv[3] === path && argv[4] === 'rev-list').map(argv => argv.slice(4).join(' '))

const keysOf = async (ui: Ui) => (await ui.findAll({ type: 'Box' })).map(box => box.key ?? '').filter(Boolean)

async function agentsStarted($: Engine, on: On) {
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', (_, e) => ({ model: 'claude-haiku-5-5', agentId: e.workflow ? `w${e.workflow.agentIndex}` : e.description }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Workflow' }, () => ({ result: { status: 'async_launched' as const, taskId: 'wi5', runId: 'wf_7', workflowName: 'review-changes', summary: 'Review the branch' }, text: 'launched' }))
  const run = await started($, on)
  await $.tool.call({ tool: 'Workflow', script: "export const meta = { name: 'review-changes', phases: [{ title: 'Review' }, { title: 'Verify' }] }" })
  const step = (index: number, description: string) => $.agent.spawn({ ...SPAWN, description, subagentType: 'workflow-subagent', model: 'haiku', background: false, workflow: { runId: 'wf_7', agentIndex: index } })
  await step(1, 'review:bugs')
  await step(2, 'verify:band.ts')
  await step(3, 'verify:atoms.ts')
  await $.agent.spawn({ ...SPAWN, name: undefined, description: 'Review auth flow', subagentType: 'Explore', model: 'haiku' })
  await $.agent.spawn({ ...SPAWN, name: 'token-finder', description: 'Find token usages', subagentType: 'master-session:researcher', model: undefined, background: false })
  const usage = { input_tokens: 9000, output_tokens: 400, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 }
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 'u1', agentId: 'w1', reason: 'answer' })
  await $.turn.complete({ answer: 'agent() threw: tsc exited 2 in hooks/lib/band.ts', durationMs: 5, isAborted: false, turnId: 'u2', agentId: 'w2', reason: 'error' })
  await $.turn.complete({ answer: '14 calls found; 12 cite their source.', durationMs: 5, isAborted: false, turnId: 'u3', agentId: 'Find token usages', reason: 'answer', usage } as never)
  return run
}

test('a session row opens its detail in place: v2-3 order, Open chat full width in the blocker, Open alone for needs you, Collapse icon only', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_env')
  expect(await ui.find({ key: 'row-local_env' })).toBeUndefined()
  const texts = await textsOf(ui)
  const title = texts.indexOf('Test and validate local agent environment')
  const at = ['BLOCKER', 'Now', 'Next', 'Main checkout', 'Git', 'Time', 'Permission', 'Model'].map(word => texts.indexOf(word, title))
  expect(title).toBeGreaterThan(0)
  expect(at.every(index => index > title)).toBe(true)
  expect([...at].sort((left, right) => left - right)).toEqual(at)
  for (const word of ['Approve the settings.json edit', 'waiting for your answer', 'dotfiles', 'master · 76c7dc8', 'active now', 'auto', 'opus · xhigh', 'Open chat', 'Open']) expect(texts).toContain(word)
  expect(texts.some(text => /^started \d\d:\d\d$/.test(text))).toBe(true)
  const hits = await hitsOf(ui)
  expect(hits).toEqual(expect.arrayContaining(['hit-collapse-local_env', 'hit-chat-local_env', 'hit-open-local_env']))
  for (const absent of ['hit-archive-local_env', 'hit-stop-local_env']) expect(hits).not.toContain(absent)
  expect((await ui.find({ key: 'face-chat-local_env' }))?.props).toEqual(expect.objectContaining({ width: '100%' }))
  expect((await ui.find({ key: 'face-open-local_env' }))?.props).toEqual(expect.objectContaining({ width: '100%' }))
  expect((await ui.find({ key: 'face-collapse-local_env' }))?.props).toEqual(expect.objectContaining({ width: across(32) }))
  expect(texts).not.toContain('Collapse')
  await click(ui, 'hit-collapse-local_env')
  expect(await ui.find({ key: 'detail-local_env' })).toBeUndefined()
  expect(await ui.find({ key: 'row-local_env' })).toBeDefined()
  await ui.unmount()
})

test('a running session shows Open and Stop as halves; Stop ends its turn through the app', async ($, on) => {
  const { calls } = await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], state: 'working', needsYou: undefined }, BOARD.sessions[1]] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_env')
  const hits = await hitsOf(ui)
  expect(hits).toEqual(expect.arrayContaining(['hit-open-local_env', 'hit-stop-local_env']))
  expect(hits).not.toContain('hit-archive-local_env')
  expect(await ui.find({ type: 'Text', text: 'BLOCKER' })).toBeUndefined()
  await click(ui, 'hit-stop-local_env')
  expect(calls.filter(one => one.tool === 'stop_session').map(one => one.args.session_id)).toEqual(['local_env'])
  await ui.unmount()
})

test('a clean idle session archives in one click; its row turns into an Undo bar for 10 s and Undo brings it back', async ($, on) => {
  const { calls, toasts, clock } = await started($, on, DONE_BOARD, UNMERGED)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_conductor')
  expect(await ui.find({ type: 'Text', text: 'Archive' })).toBeDefined()
  await click(ui, 'hit-archive-local_conductor')
  expect(await ui.find({ key: 'confirm-local_conductor' })).toBeUndefined()
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  expect(toasts).toEqual([])
  expect(await ui.find({ key: 'undo-bar-done' })).toBeDefined()
  expect(await textsOf(ui)).toContain('conductor-redo archived, worktree removed')
  await click(ui, 'hit-undo-done')
  expect(calls.filter(one => one.tool === 'unarchive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  expect(await ui.find({ key: 'undo-bar-done' })).toBeUndefined()
  await click(ui, 'hit-row-local_conductor')
  await click(ui, 'hit-archive-local_conductor')
  expect(await ui.find({ key: 'undo-bar-done' })).toBeDefined()
  await clock.advance(10_000)
  expect(await ui.find({ key: 'undo-bar-done' })).toBeUndefined()
  await ui.unmount()
})

test('work that would be lost asks inside the card: Archive… opens the box in place of the action row; Cancel keeps it, Archive and remove archives', async ($, on) => {
  const { calls } = await started($, on, DONE_BOARD, UNMERGED)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  expect(await ui.find({ type: 'Text', text: 'Archive…' })).toBeDefined()
  await click(ui, 'hit-archive-local_setup')
  const keys = await keysOf(ui)
  expect(keys.indexOf('confirm-local_setup')).toBeGreaterThan(keys.indexOf('detail-local_setup'))
  expect(keys).not.toContain('actions-local_setup')
  const texts = await textsOf(ui)
  for (const word of ['Archive setup-ui-redo?', 'Archiving stops the session and removes its worktree. This would be lost:', '1 uncommitted file in wt-toolkit-setup-ui', '2 commits on its branch that are not on main', 'the worktree folder itself', 'Cancel', 'Archive and remove'])
    expect(texts).toContain(word)
  expect((await ui.find({ key: 'face-archive-yes-local_setup' }))?.props).toEqual(expect.objectContaining({ width: '100%' }))
  await click(ui, 'hit-archive-no-local_setup')
  expect(await ui.find({ key: 'confirm-local_setup' })).toBeUndefined()
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await click(ui, 'hit-archive-local_setup')
  await click(ui, 'hit-archive-yes-local_setup')
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_setup'])
  await ui.unmount()
})

test('Archive all archives the clean sessions without asking, skips unmerged work with an amber line, and says so in an Undo bar', async ($, on) => {
  const { calls } = await started($, on, DONE_BOARD, UNMERGED)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '2 commits not on main' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Archive all' })).toBeDefined()
  await click(ui, 'hit-archive-all')
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  expect(await ui.find({ type: 'Text', text: 'Archived 1 session · skipped 1 with unmerged work' })).toBeDefined()
  expect(await ui.find({ key: 'row-local_setup' })).toBeDefined()
  await click(ui, 'hit-undo-done')
  expect(calls.filter(one => one.tool === 'unarchive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  await ui.unmount()
})

test('a workflow row opens its detail: run line, strip, the failed agent block, one Agents group with marks, Time and Usage, no actions', async ($, on) => {
  await agentsStarted($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-wf_7')
  expect(await ui.find({ key: 'detail-wf_7' })).toBeDefined()
  const texts = await textsOf(ui)
  for (const word of ['review-changes', 'working', 'Workflow', 'run wf_7', '1 AGENT FAILED', 'verify:band.ts', 'agent() threw: tsc exited 2 in hooks/lib/band.ts', 'Agents', '1/3', 'review:bugs', 'verify:atoms.ts', 'done', 'failed', 'running', 'Time', 'Usage', '3 agents'])
    expect(texts).toContain(word)
  expect(texts.some(text => /^running \d+s$/.test(text))).toBe(true)
  expect((await ui.findAll({ type: 'Svg' })).map(one => one.props.alt)).toEqual(expect.arrayContaining(['1 of 3 agents done', 'done', 'failed', 'running', '1 of 3']))
  const hits = await hitsOf(ui)
  expect(hits).toContain('hit-collapse-wf_7')
  for (const absent of ['hit-open-wf_7', 'hit-archive-wf_7', 'hit-stop-wf_7']) expect(hits).not.toContain(absent)
  await click(ui, 'hit-collapse-wf_7')
  expect(await ui.find({ key: 'row-wf_7' })).toBeDefined()
  await ui.unmount()
})

test('a subagent row opens its detail without a ring or actions: task and prompt, type, model and its source, who started it, time, result and tokens once done', async ($, on) => {
  await agentsStarted($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-Review auth flow')
  const running = await textsOf(ui)
  for (const word of ['Task', 'Review auth flow', 'Read the docs.', 'Agent type', 'Explore', 'Model', 'haiku', 'set by the call; parent runs opus', 'Started by', 'main chat', 'background · not a fork', 'Not a session, so nothing to open, stop or archive here. It moves to Done when it finishes.'])
    expect(running).toContain(word)
  expect(running.some(text => /^running \d+s$/.test(text))).toBe(true)
  expect((await hitsOf(ui)).filter(hit => hit.endsWith('-Review auth flow'))).toEqual(['hit-collapse-Review auth flow'])
  expect((await ui.findAll({ type: 'Svg' })).some(one => / of /.test(String(one.props.alt)) && String(one.props.key).includes('Review auth flow'))).toBe(false)
  await click(ui, 'hit-row-Find token usages')
  expect(await ui.find({ key: 'detail-Review auth flow' })).toBeUndefined()
  const done = await textsOf(ui)
  for (const word of ['token-finder', 'done', 'master-session:researcher', 'from the agent definition', 'foreground · named token-finder', 'Result', '14 calls found; 12 cite their source.', '18.4k tokens', 'Subagents have no Archive. Archive all skips this row.'])
    expect(done).toContain(word)
  expect(done.some(text => /^took \d+s$/.test(text))).toBe(true)
  await ui.unmount()
})

test('the terminal draws each detail as text: session actions and the archive box, the workflow with its failed agent, the subagent', async ($, on) => {
  const { calls } = await agentsStarted($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row-open-local_setup' })
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  await ui.press({ key: 'archive-local_setup' })
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Archive setup-ui-redo?', '• 1 uncommitted file in wt-toolkit-setup-ui', '• the worktree folder itself']))
  await ui.press({ key: 'archive-no-local_setup' })
  expect(await ui.find({ key: 'confirm-local_setup' })).toBeUndefined()
  await ui.press({ key: 'row-open-wf_7' })
  const flow = await textsOf(ui)
  expect(flow).toEqual(expect.arrayContaining(['Workflow · run wf_7 · 1/3 done', 'Failed: verify:band.ts — agent() threw: tsc exited 2 in hooks/lib/band.ts', 'Usage: 3 agents']))
  expect(flow.some(text => /^✗ verify:band\.ts · failed · \d+s$/.test(text))).toBe(true)
  await ui.press({ key: 'row-open-Find token usages' })
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Task: Find token usages', 'Result: 14 calls found; 12 cite their source.', '18.4k tokens']))
  await ui.press({ key: 'collapse-Find token usages' })
  expect(await ui.find({ key: 'detail-Find token usages' })).toBeUndefined()
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await ui.unmount()
})

test('the terminal Archive all and one-click archive mirror the desktop: no box for clean work, an Undo line after', async ($, on) => {
  const { calls } = await started($, on, DONE_BOARD, UNMERGED)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'archive-all' })
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  expect(await textsOf(ui)).toContain('Archived 1 session · skipped 1 with unmerged work')
  await ui.press({ key: 'undo-archive' })
  expect(calls.filter(one => one.tool === 'unarchive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  await ui.unmount()
})

test('a clean, merged worktree archives in one click; the base is the repo default branch, compared as <default>..HEAD', async ($, on) => {
  const git = { ...BASE, [`${WORKTREE} worktree`]: TREES('branch refs/heads/main'), [`${CLEAN} status`]: '# branch.oid 1111111\n# branch.head feat/clean\n', [`${CLEAN} rev-list`]: '0\n' }
  const { calls, gits } = await started($, on, doneOf('local_clean'), { git, sessions: [session('local_clean', 'clean-work', CLEAN)] })
  expect(revList(gits, CLEAN)).toContain('rev-list --count main..HEAD')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_clean')
  expect(await ui.find({ type: 'Text', text: 'Archive' })).toBeDefined()
  await click(ui, 'hit-archive-local_clean')
  expect(await ui.find({ key: 'confirm-local_clean' })).toBeUndefined()
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_clean'])
  await ui.unmount()
})

test('a session whose tree is unknown fails closed: git state unknown on its row, the box on Archive, and Archive all skips it', async ($, on) => {
  const { calls } = await started($, on, doneOf('local_lost'), { sessions: [session('local_lost', 'lost-work', `${HOME}/nowhere`)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'git state unknown' })).toBeDefined()
  await click(ui, 'hit-row-local_lost')
  expect(await ui.find({ type: 'Text', text: 'Archive…' })).toBeDefined()
  await click(ui, 'hit-archive-local_lost')
  expect(await ui.find({ key: 'confirm-local_lost' })).toBeDefined()
  expect(await textsOf(ui)).toContain('git state unknown')
  await click(ui, 'hit-archive-no-local_lost')
  await click(ui, 'hit-collapse-local_lost')
  await click(ui, 'hit-archive-all')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(await ui.find({ type: 'Text', text: 'Archived 0 sessions · skipped 2 with unmerged work' })).toBeDefined()
  expect(await ui.find({ key: 'face-undo-done' })).toBeUndefined()
  await ui.unmount()
})

test('a failed rev-list counts as unknown, not as merged', async ($, on) => {
  await started($, on, doneOf(), { git: BASE })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  await click(ui, 'hit-archive-local_setup')
  const texts = await textsOf(ui)
  for (const word of ['1 uncommitted file in wt-toolkit-setup-ui', 'git state unknown', 'the worktree folder itself']) expect(texts).toContain(word)
  await ui.unmount()
})

test('a detached main checkout still compares against the default branch, and a master repo says master', async ($, on) => {
  const git = { [`${WORKTREE} worktree`]: TREES('detached'), [`${WORKTREE} symbolic-ref`]: 'origin/master\n', [`${WORKTREE} rev-parse --verify --quiet refs/heads/master`]: 'd575596\n', [`${WORKTREE} rev-list`]: '3\n' }
  const { gits } = await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'done' }] }, { git })
  expect(revList(gits, WORKTREE)).toEqual(expect.arrayContaining(['rev-list --count master..HEAD']))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '3 commits not on master' })).toBeDefined()
  await click(ui, 'hit-row-local_setup')
  await click(ui, 'hit-archive-local_setup')
  expect(await textsOf(ui)).toContain('3 commits on its branch that are not on master')
  await ui.unmount()
})

test('Archive all with only unmerged work archives nothing and says it skipped them', async ($, on) => {
  const { calls } = await started($, on, doneOf(), UNMERGED)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-archive-all')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(await ui.find({ type: 'Text', text: 'Archived 0 sessions · skipped 1 with unmerged work' })).toBeDefined()
  expect(await ui.find({ key: 'row-local_setup' })).toBeDefined()
  await ui.unmount()
})

test('Open shows for a session without live data; Archive and Stop need it', async ($, on) => {
  await started($, on, doneOf('local_ghost'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_ghost')
  const hits = await hitsOf(ui)
  expect(hits).toContain('hit-open-local_ghost')
  for (const absent of ['hit-archive-local_ghost', 'hit-stop-local_ghost']) expect(hits).not.toContain(absent)
  await ui.unmount()
})

test('archiving the last row of a group keeps the group heading for the 10 s Undo bar', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [...BOARD.sessions, finished('local_conductor')] }, { sessions: [CONDUCTOR] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_conductor')
  await click(ui, 'hit-archive-local_conductor')
  const keys = await keysOf(ui)
  expect(keys.indexOf('undo-bar-done')).toBeGreaterThan(keys.indexOf('group-head-done'))
  expect(keys.indexOf('group-head-done')).toBeGreaterThan(-1)
  await ui.unmount()
})
