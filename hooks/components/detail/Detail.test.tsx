import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { across, tall } from '../../lib/layout'
import { C } from '../../theme/tokens'
import { AT, BOARD, HOME, PANE, SELF, SPAWN, TOOLKIT, WORKTREE, altsOf, click, hitsOf, started, textsOf, warmUp } from '../../testing/world'
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

warmUp()

test('a session row opens its card in place: the same row on top with Open chat, then Now, Next, place, Git, Time, Permission, Model and Open alone', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_env')
  expect(await ui.find({ key: 'row-local_env' })).toBeUndefined()
  expect((await ui.find({ key: 'detail-local_env' }))?.props).toEqual(expect.objectContaining({ borderStyle: 'round', borderColor: C.red }))
  const top = await ui.find({ key: 'top-local_env' })
  expect(top?.props).toEqual(expect.objectContaining({ minHeight: tall(56), paddingLeft: across(12), paddingRight: across(8) }))
  expect(top?.props.borderStyle).toBeUndefined()
  const texts = await textsOf(ui)
  const title = texts.indexOf('Test and validate local agent environment')
  const at = ['Now', 'Next', 'Main checkout', 'Git', 'Time', 'Permission', 'Model'].map(word => texts.indexOf(word, title))
  expect(title).toBeGreaterThan(0)
  expect(at.every(index => index > title)).toBe(true)
  expect([...at].sort((left, right) => left - right)).toEqual(at)
  for (const word of ['Session', 'Approve the settings.json edit', 'dotfiles', 'master · 76c7dc8', 'active now', 'auto', 'opus · xhigh', 'Open']) expect(texts).toContain(word)
  for (const word of ['BLOCKER', 'Collapse', 'waiting for your answer']) expect(texts).not.toContain(word)
  expect((await ui.findAll({ type: 'Svg' })).map(one => one.props.alt)).toEqual(expect.arrayContaining(['Open chat', 'needs you']))
  expect(texts.some(text => /^started \d\d:\d\d$/.test(text))).toBe(true)
  const hits = await hitsOf(ui)
  expect(hits).toEqual(expect.arrayContaining(['hit-top-local_env', 'hit-chat-local_env', 'hit-open-local_env']))
  for (const absent of ['hit-archive-local_env', 'hit-stop-local_env', 'hit-row-local_env']) expect(hits).not.toContain(absent)
  expect((await ui.find({ key: 'face-chat-local_env' }))?.props).toEqual(expect.objectContaining({ height: tall(32) }))
  expect((await ui.find({ key: 'face-open-local_env' }))?.props).toEqual(expect.objectContaining({ width: '100%' }))
  await click(ui, 'hit-top-local_env')
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
  for (const word of ['Archive Redo toolkit setup UI?', 'Archiving stops the session and removes its worktree. This would be lost:', '1 uncommitted file in wt-toolkit-setup-ui', '2 commits on its branch that are not on main', 'the worktree folder itself', 'Cancel'])
    expect(texts).toContain(word)
  expect((await ui.findAll({ type: 'Svg' })).map(one => one.props.alt)).toContain('Archive and remove')
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
  expect(await ui.find({ type: 'Text', text: 'Archived 1 session · skipped 1 with work to keep' })).toBeDefined()
  expect(await ui.find({ key: 'row-local_setup' })).toBeDefined()
  await click(ui, 'hit-undo-done')
  expect(calls.filter(one => one.tool === 'unarchive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  await ui.unmount()
})

test('a workflow row opens its card: run line, strip, the failed callout, the Agents block with shared agent rows, Time and Usage, no actions', async ($, on) => {
  await agentsStarted($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-wf_7')
  expect(await ui.find({ key: 'detail-wf_7' })).toBeDefined()
  const texts = await textsOf(ui)
  for (const word of ['Workflow', 'review-changes', 'verify:atoms.ts', '1 AGENT FAILED', 'verify:band.ts', 'agent() threw: tsc exited 2 in hooks/lib/band.ts', 'Agents', '1/3', 'Agent', 'review:bugs', 'done', 'failed', 'running', 'Time', 'Usage', '3 agents'])
    expect(texts).toContain(word)
  expect(texts.some(text => /^run wf_7 · started by the Validator · \d\d:\d\d$/.test(text))).toBe(true)
  expect(texts.some(text => /^running \d+s$/.test(text))).toBe(true)
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['1 of 3 agents done', 'done', 'failed', 'working', '1 of 3', 'Workflow agent']))
  const hits = await hitsOf(ui)
  expect(hits).toEqual(expect.arrayContaining(['hit-top-wf_7', 'hit-row-w1', 'hit-row-w2', 'hit-row-w3']))
  for (const absent of ['hit-open-wf_7', 'hit-archive-wf_7', 'hit-stop-wf_7', 'hit-chat-wf_7']) expect(hits).not.toContain(absent)
  await click(ui, 'hit-row-w2')
  expect(await ui.find({ key: 'detail-wf_7' })).toBeDefined()
  expect(await ui.find({ key: 'detail-w2' })).toBeDefined()
  const agent = await textsOf(ui)
  for (const word of ['FAILED', 'Task', 'Started by', 'Workflow · review-changes', 'workflow agent 2 of 3', 'Model', 'haiku']) expect(agent).toContain(word)
  await click(ui, 'hit-top-w2')
  expect(await ui.find({ key: 'detail-w2' })).toBeUndefined()
  expect(await ui.find({ key: 'detail-wf_7' })).toBeDefined()
  await click(ui, 'hit-top-wf_7')
  expect(await ui.find({ key: 'row-wf_7' })).toBeDefined()
  await ui.unmount()
})

test('a subagent row opens its card without a ring or actions: task and prompt, model and type, who started it, time, result and tokens once done', async ($, on) => {
  await agentsStarted($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-Review auth flow')
  const running = await textsOf(ui)
  for (const word of ['Explore', 'Review auth flow', 'Validator ›', 'running', 'Task', 'Read the docs.', 'Model', 'haiku', 'Started by', 'Validator', 'background', 'Time'])
    expect(running).toContain(word)
  expect(running.some(text => /^running \d+s$/.test(text))).toBe(true)
  expect((await hitsOf(ui)).filter(hit => hit.endsWith('-Review auth flow'))).toEqual(['hit-top-Review auth flow'])
  expect((await ui.findAll({ type: 'Svg' })).some(one => / of /.test(String(one.props.alt)) && String(one.props.key).includes('Review auth flow'))).toBe(false)
  await click(ui, 'hit-row-Find token usages')
  expect(await ui.find({ key: 'detail-Review auth flow' })).toBeUndefined()
  const done = await textsOf(ui)
  for (const word of ['Researcher', 'Find token usages', 'done', 'master-session:researcher', 'foreground', 'Result', '14 calls found; 12 cite their source.', '18.4k tokens'])
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
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Archive Redo toolkit setup UI?', '• 1 uncommitted file in wt-toolkit-setup-ui', '• the worktree folder itself']))
  await ui.press({ key: 'archive-no-local_setup' })
  expect(await ui.find({ key: 'confirm-local_setup' })).toBeUndefined()
  await ui.press({ key: 'row-open-wf_7' })
  const flow = await textsOf(ui)
  expect(flow).toEqual(expect.arrayContaining(['Workflow · review-changes', 'run wf_7 · 1/3 done', 'Failed: verify:band.ts — agent() threw: tsc exited 2 in hooks/lib/band.ts', 'Usage: 3 agents']))
  expect(flow.some(text => /^failed · agent\(\) threw: tsc exited 2 in hooks\/lib\/band\.ts · \d+s$/.test(text))).toBe(true)
  expect(await ui.find({ key: 'agent-open-w2' })).toBeDefined()
  await ui.press({ key: 'agent-open-w2' })
  expect(await ui.find({ key: 'detail-wf_7' })).toBeDefined()
  expect(await ui.find({ key: 'detail-w2' })).toBeDefined()
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Task: verify:band.ts', 'Started by: Workflow · review-changes · workflow agent 2 of 3', 'Error: agent() threw: tsc exited 2 in hooks/lib/band.ts']))
  await ui.press({ key: 'collapse-w2' })
  expect([!!(await ui.find({ key: 'detail-wf_7' })), !!(await ui.find({ key: 'detail-w2' }))]).toEqual([true, false])
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
  expect(await textsOf(ui)).toContain('Archived 1 session · skipped 1 with work to keep')
  await ui.press({ key: 'undo-archive' })
  expect(calls.filter(one => one.tool === 'unarchive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  await ui.unmount()
})

test('a clean, merged worktree archives in one click; the base is the repo default branch, compared as <default>..HEAD', async ($, on) => {
  const git = { ...BASE, [`${WORKTREE} worktree`]: TREES('branch refs/heads/main'), [`${CLEAN} status`]: '# branch.oid 1111111\n# branch.head feat/clean\n', [`${CLEAN} rev-list`]: '0\n' }
  const { calls, gits } = await started($, on, doneOf('local_clean'), { git, sessions: [session('local_clean', 'clean-work', CLEAN)] })
  expect(revList(gits, CLEAN)).toContain('rev-list --count refs/heads/main..HEAD')
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
  await click(ui, 'hit-top-local_lost')
  await click(ui, 'hit-archive-all')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(await ui.find({ type: 'Text', text: 'Archived 0 sessions · skipped 2 with work to keep' })).toBeDefined()
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
  expect(revList(gits, WORKTREE)).toEqual(expect.arrayContaining(['rev-list --count refs/heads/master..HEAD']))
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
  expect(await ui.find({ type: 'Text', text: 'Archived 0 sessions · skipped 1 with work to keep' })).toBeDefined()
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

const CLEAN_GIT = () => ({ ...BASE, [`${WORKTREE} worktree`]: TREES('branch refs/heads/main'), [`${CLEAN} status`]: '# branch.oid 1111111\n# branch.head feat/clean\n', [`${CLEAN} rev-list`]: '0\n' })

test('losses follow the live cwd: a worker whose board cwd is the main checkout still asks before removing its dirty, unmerged worktree', async ($, on) => {
  const report = { v: 1, kind: 'status', session: 'local_setup', engineId: 'engine-setup', parent: SELF, seq: 1, at: 3_500_000, run: { isRunning: false }, modelAt: 0, state: 'done', activity: [], commits: [], tests: [], files: [], git: { branch: 'main', dirty: 0, ahead: 0, at: 3_500_000, path: TOOLKIT } }
  const files = { [`${HOME}/.claude/state/master-session/sessions/local_setup.json`]: JSON.stringify(report) }
  const { calls, clock } = await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'done' }] }, { ...UNMERGED, files })
  await clock.advance(3_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  expect(await ui.find({ type: 'Text', text: 'Archive…' })).toBeDefined()
  await click(ui, 'hit-archive-local_setup')
  const texts = await textsOf(ui)
  for (const word of ['1 uncommitted file in wt-toolkit-setup-ui', '2 commits on its branch that are not on main']) expect(texts).toContain(word)
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await ui.unmount()
})

test('a listed worktree whose git status fails stays listed as unknown instead of falling back to the enclosing main checkout', async ($, on) => {
  const inner = `${TOOLKIT}/.worktrees/inner`
  const git = { ...BASE, [`${WORKTREE} worktree`]: `${TREES('branch refs/heads/main')}worktree ${inner}\nHEAD 2222222bbbbbbb\nbranch refs/heads/feat/inner\n\n` }
  const { calls } = await started($, on, doneOf('local_inner'), { git, sessions: [session('local_inner', 'inner-work', inner)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_inner')
  expect(await ui.find({ type: 'Text', text: 'Archive…' })).toBeDefined()
  await click(ui, 'hit-archive-local_inner')
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['git state unknown', 'the worktree folder itself']))
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await ui.unmount()
})

test('a clean merged done row says merged to main as its state word, with the sha muted after it', async ($, on) => {
  await started($, on, doneOf('local_clean'), { git: CLEAN_GIT(), sessions: [session('local_clean', 'clean-work', CLEAN)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const word = await ui.find({ type: 'Text', text: 'merged to main' })
  expect(word?.props).toEqual(expect.objectContaining({ color: C.text, weight: 'semibold' }))
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['merged to main', 'merged']))
  await ui.unmount()
})

test('archive checks again before it acts: work that appeared since the render opens the box instead of archiving', async ($, on) => {
  const git: Record<string, string> = CLEAN_GIT()
  const { calls } = await started($, on, doneOf('local_clean'), { git, sessions: [session('local_clean', 'clean-work', CLEAN)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_clean')
  expect(await ui.find({ type: 'Text', text: 'Archive' })).toBeDefined()
  git[`${CLEAN} status`] = '# branch.oid 1111111\n# branch.head feat/clean\n? new.sh\n'
  await click(ui, 'hit-archive-local_clean')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(await ui.find({ key: 'confirm-local_clean' })).toBeDefined()
  expect(await textsOf(ui)).toContain('1 uncommitted file in wt-toolkit-clean')
  await click(ui, 'hit-archive-yes-local_clean')
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_clean'])
  await ui.unmount()
})

test('Archive all checks again before it acts: a row with new work moves into skipped', async ($, on) => {
  const git: Record<string, string> = CLEAN_GIT()
  const { calls } = await started($, on, doneOf('local_conductor', 'local_clean'), { git, sessions: [CONDUCTOR, session('local_clean', 'clean-work', CLEAN)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  git[`${CLEAN} status`] = '# branch.oid 1111111\n# branch.head feat/clean\n? new.sh\n'
  await click(ui, 'hit-archive-all')
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  expect(await ui.find({ type: 'Text', text: 'Archived 1 session · skipped 2 with work to keep' })).toBeDefined()
  await ui.unmount()
})

test('the Undo bar takes the archived row’s place in its group', async ($, on) => {
  await started($, on, doneOf('local_conductor'), UNMERGED)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const before = await keysOf(ui)
  expect(before.indexOf('row-local_setup')).toBeLessThan(before.indexOf('row-local_conductor'))
  await click(ui, 'hit-row-local_conductor')
  await click(ui, 'hit-archive-local_conductor')
  const after = await keysOf(ui)
  expect(after.indexOf('undo-bar-done')).toBeGreaterThan(after.indexOf('row-local_setup'))
  expect(after.indexOf('group-head-done')).toBeLessThan(after.indexOf('row-local_setup'))
  await ui.unmount()
})

test('a repo with no origin/HEAD, no main and no master is unknown: the row says so, Archive… asks, Archive all skips', async ($, on) => {
  const { calls } = await started($, on, doneOf())
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'git state unknown' })).toBeDefined()
  await click(ui, 'hit-row-local_setup')
  await click(ui, 'hit-archive-local_setup')
  expect(await ui.find({ key: 'confirm-local_setup' })).toBeDefined()
  expect(await textsOf(ui)).toContain('git state unknown')
  await click(ui, 'hit-archive-no-local_setup')
  await click(ui, 'hit-top-local_setup')
  await click(ui, 'hit-archive-all')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(await ui.find({ type: 'Text', text: 'Archived 0 sessions · skipped 1 with work to keep' })).toBeDefined()
  await ui.unmount()
})

const STATUS = 'status --porcelain=v2 --branch --untracked-files=all --ignore-submodules=none'

const parentOf = (node: unknown, text: string, parent?: unknown): unknown => {
  if (!node || typeof node !== 'object') return undefined
  const one = node as { type?: string; children?: unknown[] }
  if (one.type === 'Text' && (one.children ?? []).join('') === text) return parent
  for (const child of one.children ?? []) {
    const found = parentOf(child, text, node)
    if (found) return found
  }
  return undefined
}

test('git status always lists untracked files and submodules: a repo that hides them by config still asks before removing them', async ($, on) => {
  const git = { ...CLEAN_GIT(), [`${CLEAN} ${STATUS}`]: '# branch.oid 1111111\n# branch.head feat/clean\n? new.sh\n' }
  const { calls, gits } = await started($, on, doneOf('local_clean'), { git, sessions: [session('local_clean', 'clean-work', CLEAN)] })
  expect(gits.some(argv => argv[3] === CLEAN && argv.slice(4).join(' ') === STATUS)).toBe(true)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_clean')
  await click(ui, 'hit-archive-local_clean')
  expect(await ui.find({ key: 'confirm-local_clean' })).toBeDefined()
  expect(await textsOf(ui)).toContain('1 uncommitted file in wt-toolkit-clean')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await ui.unmount()
})

test('another repo’s worktree inside a known repo’s folder is read as its own repo, not as that folder’s main checkout', async ($, on) => {
  const other = `${HOME}/Work/other`
  const nested = `${TOOLKIT}/.worktrees/other-feat`
  const git = {
    ...UNMERGED.git,
    [`${nested} worktree`]: `worktree ${other}\nHEAD 3333333cccccc\nbranch refs/heads/main\n\nworktree ${nested}\nHEAD 4444444dddddd\nbranch refs/heads/feat/other\n\n`,
    [`${nested} status`]: '# branch.oid 4444444\n# branch.head feat/other\n',
    [`${nested} symbolic-ref`]: 'origin/main\n',
    [`${nested} rev-parse`]: '3333333\n',
    [`${nested} rev-list`]: '2\n',
  }
  const { calls } = await started($, on, doneOf('local_other'), { git, sessions: [session('local_other', 'other-work', nested)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_other')
  await click(ui, 'hit-archive-local_other')
  expect(await ui.find({ key: 'confirm-local_other' })).toBeDefined()
  expect(await textsOf(ui)).toContain('2 commits on feat/other that are not on main')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await ui.unmount()
})

test('a path inside a known repo whose own git fails is its own unknown tree, never the enclosing main checkout', async ($, on) => {
  const inner = `${TOOLKIT}/.worktrees/broken`
  const { calls } = await started($, on, doneOf('local_broken'), { ...UNMERGED, sessions: [session('local_broken', 'broken-work', inner)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_broken')
  await click(ui, 'hit-archive-local_broken')
  expect(await ui.find({ key: 'confirm-local_broken' })).toBeDefined()
  expect(await textsOf(ui)).toContain('git state unknown')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await ui.unmount()
})

test('archive reads git again and fails closed when that read finds nothing', async ($, on) => {
  const git: Record<string, string> = CLEAN_GIT()
  const { calls } = await started($, on, doneOf('local_clean'), { git, sessions: [session('local_clean', 'clean-work', CLEAN)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_clean')
  expect(await ui.find({ type: 'Text', text: 'Archive' })).toBeDefined()
  git[`${WORKTREE} worktree`] = ''
  await click(ui, 'hit-archive-local_clean')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(await ui.find({ key: 'confirm-local_clean' })).toBeDefined()
  expect(await textsOf(ui)).toContain('git state unknown')
  await ui.unmount()
})

test('archive stops when the live session list can’t be read, so a session running again is never archived', async ($, on) => {
  let isFailing = false
  const { calls, toasts } = await started($, on, doneOf('local_conductor'), { sessions: [CONDUCTOR], listError: () => (isFailing ? 'list_sessions timed out' : undefined) })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_conductor')
  isFailing = true
  await click(ui, 'hit-archive-local_conductor')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(toasts).toContain('Not archived: list_sessions timed out')
  await ui.unmount()
})

test('a needs-you session without blocker text still offers Open chat on its row and in its card top', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], needsYou: undefined }, BOARD.sessions[1]] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await hitsOf(ui)).toContain('hit-chat-local_env')
  expect(await textsOf(ui)).toContain('needs you')
  await click(ui, 'hit-row-local_env')
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-chat-local_env', 'hit-open-local_env']))
  await ui.unmount()
})

test('the kind word and its dot never shrink, so an amber loss line can’t wrap "Session"', async ($, on) => {
  await started($, on, doneOf(), UNMERGED)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const tree = await ui.drawn()
  for (const text of ['Session', '·']) expect((parentOf(tree, text) as { props?: { flexShrink?: number } } | undefined)?.props?.flexShrink).toBe(0)
  await ui.unmount()
})

test('archive decides on the git state it just read, not on the stored repos, which another refresh may have left stale', async ($, on) => {
  let isStale = false
  on('state.set', ($$, e, next) => (isStale && e.plugin === 'master-session' && e.key === 'repos' ? { value: { isSet: true as const, version: 1 } } : next(e)))
  const git: Record<string, string> = CLEAN_GIT()
  const { calls } = await started($, on, doneOf('local_clean'), { git, sessions: [session('local_clean', 'clean-work', CLEAN)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_clean')
  expect(await ui.find({ type: 'Text', text: 'Archive' })).toBeDefined()
  git[`${CLEAN} status`] = '# branch.oid 1111111\n# branch.head feat/clean\n? new.sh\n'
  isStale = true
  await click(ui, 'hit-archive-local_clean')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(await ui.find({ key: 'confirm-local_clean' })).toBeDefined()
  await ui.unmount()
})

const SIDE = (patch: Record<string, unknown> = {}) => ({ sessionId: 'local_side', name: 'side-work', title: 'side-work', cwd: WORKTREE, isRunning: false, isArchived: false, lastActivityAt: AT, startedBy: 'local_conductor', ...patch })

test('archiving a session also archives its idle side session, so its losses ask first and Archive all skips it', async ($, on) => {
  const { calls } = await started($, on, { ...BOARD, sessions: [...BOARD.sessions, finished('local_conductor')] }, { git: UNMERGED.git, sessions: [CONDUCTOR, SIDE()] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'side-work: 2 commits not on main' })).toBeDefined()
  await click(ui, 'hit-row-local_conductor')
  expect(await ui.find({ type: 'Text', text: 'Archive…' })).toBeDefined()
  await click(ui, 'hit-archive-local_conductor')
  const texts = await textsOf(ui)
  for (const word of ['side-work: 1 uncommitted file in wt-toolkit-setup-ui', 'side-work: 2 commits on its branch that are not on main', 'side-work: the worktree folder itself']) expect(texts).toContain(word)
  await click(ui, 'hit-archive-no-local_conductor')
  await click(ui, 'hit-top-local_conductor')
  await click(ui, 'hit-archive-all')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(await ui.find({ type: 'Text', text: 'Archived 0 sessions · skipped 1 with work to keep' })).toBeDefined()
  await ui.unmount()
})

test('a running side session stops the archive with a toast', async ($, on) => {
  const { calls, toasts } = await started($, on, { ...BOARD, sessions: [...BOARD.sessions, finished('local_conductor')] }, { sessions: [CONDUCTOR, SIDE({ cwd: `${HOME}/dotfiles`, isRunning: true })] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_conductor')
  await click(ui, 'hit-archive-local_conductor')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(toasts).toContain('Not archived: side-work is still working')
  await ui.unmount()
})

test('when the losses are gone by the time Archive and remove is pressed, it archives instead of opening an empty box', async ($, on) => {
  const git: Record<string, string> = { ...CLEAN_GIT(), [`${CLEAN} status`]: '# branch.oid 1111111\n# branch.head feat/clean\n? new.sh\n' }
  const { calls } = await started($, on, doneOf('local_clean'), { git, sessions: [session('local_clean', 'clean-work', CLEAN)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_clean')
  await click(ui, 'hit-archive-local_clean')
  expect(await ui.find({ key: 'confirm-local_clean' })).toBeDefined()
  git[`${CLEAN} status`] = '# branch.oid 1111111\n# branch.head feat/clean\n'
  await click(ui, 'hit-archive-yes-local_clean')
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_clean'])
  expect(await ui.find({ key: 'confirm-local_clean' })).toBeUndefined()
  await ui.unmount()
})

test('wide primary buttons draw the design’s accent face, not the theme accent Box', async ($, on) => {
  await started($, on, DONE_BOARD, UNMERGED)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  await click(ui, 'hit-archive-local_setup')
  expect((await ui.find({ key: 'face-archive-yes-local_setup' }))?.props).toEqual(expect.objectContaining({ width: '100%' }))
  const faces = (await ui.findAll({ type: 'Svg' })).filter(one => one.props.alt === 'Archive and remove').map(one => String(one.props.source))
  expect(faces.some(source => source.includes('fill:var(--accentBtn)'))).toBe(true)
  expect(faces.some(source => source.includes('fill:var(--accentBtnHover)'))).toBe(true)
  await ui.unmount()
})

const FILLER = (count: number) => Array.from({ length: count }, (_, index) => ({ sessionId: `local_f${index}`, name: `filler-${index}`, title: `Filler ${index}`, cwd: '/elsewhere', isRunning: false, isArchived: false, lastActivityAt: AT }))

test('a dirty side session past the first 50 still asks: archive lists 200 family sessions, the box keeps them through the 15 s refresh, and yes archives', async ($, on) => {
  const { calls, clock } = await started($, on, { ...BOARD, sessions: [...BOARD.sessions, finished('local_conductor')] }, { git: UNMERGED.git, sessions: [CONDUCTOR, ...FILLER(55), SIDE()] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_conductor')
  const facts = calls.filter(one => one.tool === 'get_session').length
  await click(ui, 'hit-archive-local_conductor')
  expect(calls.some(one => one.tool === 'list_sessions' && one.args.limit === 200 && one.args.include_archived === true)).toBe(true)
  expect(calls.filter(one => one.tool === 'get_session').length).toBe(facts)
  expect(await ui.find({ key: 'confirm-local_conductor' })).toBeDefined()
  expect(await textsOf(ui)).toContain('side-work: 2 commits on its branch that are not on main')
  await clock.advance(15_000)
  expect(await textsOf(ui)).toContain('side-work: 2 commits on its branch that are not on main')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await click(ui, 'hit-archive-yes-local_conductor')
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  await ui.unmount()
})

test('a running session in a subfolder of the worktree shares it: archive refuses while it works', async ($, on) => {
  const sub = { sessionId: 'local_sub', name: 'sub-work', title: 'sub-work', cwd: `${CLEAN}/pkg`, isRunning: true, isArchived: false, lastActivityAt: AT, startedBy: 'local_parent' }
  const { calls, toasts } = await started($, on, doneOf('local_clean'), { git: CLEAN_GIT(), sessions: [session('local_clean', 'clean-work', CLEAN), sub] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_clean')
  await click(ui, 'hit-archive-local_clean')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  expect(toasts).toContain('Not archived: sub-work is still working')
  await ui.unmount()
})

test('200 or more family sessions may hide a side session, so every target is unknown: the box asks and Archive all skips', async ($, on) => {
  const { calls } = await started($, on, { ...BOARD, sessions: [...BOARD.sessions, finished('local_conductor')] }, { sessions: [CONDUCTOR, ...FILLER(200)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_conductor')
  await click(ui, 'hit-archive-local_conductor')
  expect(await ui.find({ key: 'confirm-local_conductor' })).toBeDefined()
  expect(await textsOf(ui)).toContain('git state unknown')
  await click(ui, 'hit-archive-no-local_conductor')
  await click(ui, 'hit-top-local_conductor')
  await click(ui, 'hit-archive-all')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await ui.unmount()
})

test('a grandchild side session counts: its repo is read and its unmerged commits ask before the archive', async ($, on) => {
  const other = `${HOME}/Work/other`
  const grand = `${HOME}/Work/other-wt`
  const git = {
    [`${grand} worktree`]: `worktree ${other}\nHEAD 3333333cccccc\nbranch refs/heads/main\n\nworktree ${grand}\nHEAD 4444444dddddd\nbranch refs/heads/feat/g\n\n`,
    [`${grand} status`]: '# branch.oid 4444444\n# branch.head feat/g\n',
    [`${other} status`]: '# branch.oid 3333333\n# branch.head main\n',
    [`${grand} symbolic-ref`]: 'origin/main\n',
    [`${grand} rev-parse`]: '3333333\n',
    [`${grand} rev-list`]: '2\n',
  }
  const kid = SIDE({ sessionId: 'local_kid', name: 'kid-work', title: 'kid-work', cwd: `${HOME}/dotfiles` })
  const grandchild = SIDE({ sessionId: 'local_grand', name: 'grand-work', title: 'grand-work', cwd: grand, startedBy: 'local_kid' })
  const { calls, gits } = await started($, on, { ...BOARD, sessions: [...BOARD.sessions, finished('local_conductor')] }, { git, sessions: [CONDUCTOR, kid, grandchild] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_conductor')
  await click(ui, 'hit-archive-local_conductor')
  expect(gits.some(argv => argv[3] === grand && argv[4] === 'worktree')).toBe(true)
  expect(await ui.find({ key: 'confirm-local_conductor' })).toBeDefined()
  expect(await textsOf(ui)).toContain('grand-work: 2 commits on feat/g that are not on main')
  await click(ui, 'hit-archive-no-local_conductor')
  await click(ui, 'hit-top-local_conductor')
  await click(ui, 'hit-archive-all')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await ui.unmount()
})

test('a side session started by an archived child still counts: archive follows startedBy through archived sessions', async ($, on) => {
  const other = `${HOME}/Work/other`
  const grand = `${HOME}/Work/other-wt`
  const git = {
    [`${grand} worktree`]: `worktree ${other}\nHEAD 3333333cccccc\nbranch refs/heads/main\n\nworktree ${grand}\nHEAD 4444444dddddd\nbranch refs/heads/feat/g\n\n`,
    [`${grand} status`]: '# branch.oid 4444444\n# branch.head feat/g\n',
    [`${other} status`]: '# branch.oid 3333333\n# branch.head main\n',
    [`${grand} symbolic-ref`]: 'origin/main\n',
    [`${grand} rev-parse`]: '3333333\n',
    [`${grand} rev-list`]: '2\n',
  }
  const kid = SIDE({ sessionId: 'local_kid', name: 'kid-work', title: 'kid-work', cwd: `${HOME}/dotfiles`, isArchived: true })
  const grandchild = SIDE({ sessionId: 'local_grand', name: 'grand-work', title: 'grand-work', cwd: grand, startedBy: 'local_kid' })
  const { calls, gits } = await started($, on, { ...BOARD, sessions: [...BOARD.sessions, finished('local_conductor')] }, { git, sessions: [CONDUCTOR, kid, grandchild] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_conductor')
  await click(ui, 'hit-archive-local_conductor')
  expect(gits.some(argv => argv[3] === grand && argv[4] === 'worktree')).toBe(true)
  expect(await ui.find({ key: 'confirm-local_conductor' })).toBeDefined()
  expect(await textsOf(ui)).toContain('grand-work: 2 commits on feat/g that are not on main')
  await click(ui, 'hit-archive-no-local_conductor')
  await click(ui, 'hit-top-local_conductor')
  await click(ui, 'hit-archive-all')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await ui.unmount()
})

test('the open tool expands a workflow agent’s own card inside its open run', async ($, on) => {
  await agentsStarted($, on)
  const answer = (await $.tool.call({ tool: 'mcp__master-session__open', expand: 'w1' })) as { result?: string }
  expect(answer.result).toBe('The master session pane is open beside the chat, showing w1 expanded in wf_7.')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'detail-wf_7' })).toBeDefined()
  expect(await ui.find({ key: 'detail-w1' })).toBeDefined()
  expect(await hitsOf(ui)).toContain('hit-top-wf_7')
  await click(ui, 'hit-top-wf_7')
  expect(await ui.find({ key: 'detail-w1' })).toBeUndefined()
  expect(await ui.find({ key: 'detail-wf_7' })).toBeUndefined()
  await ui.unmount()
  await $.tool.call({ tool: 'mcp__master-session__open', expand: 'w1' })
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ key: 'detail-wf_7' })).toBeDefined()
  await terminal.press({ key: 'collapse-wf_7' })
  expect(await terminal.find({ key: 'detail-wf_7' })).toBeUndefined()
  await terminal.unmount()
})

test('the 15 s refresh keeps reading a side session past the first 50 from the family list, so the box keeps its commits and yes archives', async ($, on) => {
  const other = `${HOME}/Work/other`
  const far = `${HOME}/Work/other-wt`
  const git = {
    ...UNMERGED.git,
    [`${far} worktree`]: `worktree ${other}\nHEAD 3333333cccccc\nbranch refs/heads/main\n\nworktree ${far}\nHEAD 4444444dddddd\nbranch refs/heads/feat/far\n\n`,
    [`${far} status`]: '# branch.oid 4444444\n# branch.head feat/far\n',
    [`${other} status`]: '# branch.oid 3333333\n# branch.head main\n',
    [`${far} symbolic-ref`]: 'origin/main\n',
    [`${far} rev-parse`]: '3333333\n',
    [`${far} rev-list`]: '2\n',
  }
  const farSide = SIDE({ sessionId: 'local_far', name: 'far-work', title: 'far-work', cwd: far })
  const { calls, clock } = await started($, on, { ...BOARD, sessions: [...BOARD.sessions, finished('local_conductor')] }, { git, sessions: [CONDUCTOR, ...FILLER(55), farSide] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_conductor')
  await click(ui, 'hit-archive-local_conductor')
  expect(await textsOf(ui)).toContain('far-work: 2 commits on feat/far that are not on main')
  await clock.advance(15_000)
  const texts = await textsOf(ui)
  expect(texts).toContain('far-work: 2 commits on feat/far that are not on main')
  expect(texts).not.toContain('far-work: git state unknown')
  await click(ui, 'hit-archive-yes-local_conductor')
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_conductor'])
  await ui.unmount()
})

test('a done session with a reported sha reads ready for verify in Waiting, and archiving it puts the Undo bar in Waiting at its own index, not Done', async ($, on) => {
  const waiting = { id: 'local_conductor', name: 'conductor-redo', state: 'waiting', now: 'waiting for the go' }
  const { calls } = await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'done', sha: '0a4621c' }, waiting] }, UNMERGED)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const before = await keysOf(ui)
  expect(before.indexOf('group-head-waiting')).toBeLessThan(before.indexOf('row-local_conductor'))
  expect(before.indexOf('row-local_conductor')).toBeLessThan(before.indexOf('row-local_setup'))
  expect(before).not.toContain('group-head-done')
  await click(ui, 'hit-row-local_setup')
  await click(ui, 'hit-archive-local_setup')
  await click(ui, 'hit-archive-yes-local_setup')
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_setup'])
  const after = await keysOf(ui)
  expect(after).toContain('undo-bar-waiting')
  expect(after).not.toContain('undo-bar-done')
  expect(after.indexOf('row-local_conductor')).toBeLessThan(after.indexOf('undo-bar-waiting'))
  await ui.unmount()
})

test('a merged worktree with a reported sha sits in Done, which needs its git state, and archiving it puts the Undo bar in Done, not Waiting', async ($, on) => {
  const { calls } = await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...finished('local_clean'), sha: '1111111' }] }, { git: CLEAN_GIT(), sessions: [session('local_clean', 'clean-work', CLEAN)] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const before = await keysOf(ui)
  expect(before.indexOf('group-head-done')).toBeLessThan(before.indexOf('row-local_clean'))
  await click(ui, 'hit-row-local_clean')
  await click(ui, 'hit-archive-local_clean')
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_clean'])
  const after = await keysOf(ui)
  expect(after).toContain('undo-bar-done')
  expect(after).not.toContain('undo-bar-waiting')
  await ui.unmount()
})

test('the open tool expands a workflow agent inside its run, in the terminal as on the desktop', async ($, on) => {
  await agentsStarted($, on)
  const answer = (await $.tool.call({ tool: 'mcp__master-session__open', expand: 'w3' })) as { result?: string }
  expect(answer.result).toBe('The master session pane is open beside the chat, showing w3 expanded in wf_7.')
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect([surface, !!(await ui.find({ key: 'detail-wf_7' })), !!(await ui.find({ key: 'detail-w3' }))]).toEqual([surface, true, true])
    await ui.unmount()
  }
})

test('the terminal session card lists tests like the desktop pills: failed first as "✗ <name> · failed", then newest first with ✓, one per command', async ($, on) => {
  const tests = ['tsc -p . --noEmit · exit 0', 'archive.test.ts · 3 failing', 'plugin test · passed · 226 pass', 'lint · passed', 'plugin test · passed · 228 pass', 'tsc · 2 errors']
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], tests }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row-open-local_setup' })
  const line = (await textsOf(ui)).find(text => text.startsWith('Tests: '))
  expect(line).toBe('Tests: ✗ tsc · failed · ✗ archive.test.ts · failed · ✓ plugin test · 228 pass · ✓ lint')
  await ui.unmount()
})
