import { expect, test } from 'claude-code/testing'

import type { AgentRecord, BoardSession, LiveSession, Repo, Running } from '../../types'

import type { Status } from '../theme/icons'
import type { WorkflowAgent, WorkflowRun } from './agents'
import type { Context, RowItem } from './list'
import type { Row } from './rows'
import { activityWordsOf, isCommandText, nameIdentOf, partOfOf, starterOf, stateWordOf, statusSentenceOf, taskOf } from './status'

const AT = 10_000_000
const HOME = '/home/me'
const SELF = 'master'
const SECRET = 'ARGS=(--password X40) && mysql "${ARGS[@]}"'

const tree = (path: string, extra: object = {}) => ({ path, branch: 'feat/x', sha: 'abc1234', isMain: false, dirty: 0, paths: [], upstream: '', ahead: 0, behind: 0, unmerged: 0, ...extra })

const repo = (extra: object = {}, treeExtra: object = {}): Repo => ({ path: '/w/repo', name: 'repo', localOnly: 0, base: 'main', worktrees: [tree('/w/repo', { isMain: true, branch: 'main' }), tree('/w/repo-x', treeExtra)], ...extra })

const live = (extra: Partial<LiveSession> = {}): LiveSession => ({ id: 's1', name: 'env', title: 'Env task', cwd: '/w/repo-x', isRunning: false, isArchived: false, lastActivityAt: AT - 300_000, startedBy: SELF, ...extra })

const rowOf = (board: Partial<BoardSession> = {}, liveExtra: Partial<LiveSession> | null = {}, id = 's1'): Row => ({
  id,
  name: 'env',
  title: 'Env task',
  state: 'working',
  board: { id, name: 'env', state: 'working', persona: 'Implementer', cwd: '/w/repo-x', ...board },
  ...(liveExtra ? { live: live({ id, ...liveExtra }) } : {}),
})

const ctx = (patch: Partial<Context> = {}): Context => ({ at: AT, trees: [], sessions: [], agents: [], rows: [], self: SELF, ...patch })

const session = (status: Status, board: Partial<BoardSession> = {}, patch: { isOwn?: boolean; live?: Partial<LiveSession> | null } = {}): Extract<RowItem, { kind: 'session' }> => ({
  kind: 'session',
  id: 's1',
  group: 'working',
  status,
  isOwn: patch.isOwn ?? true,
  row: rowOf(board, patch.live === undefined ? {} : patch.live),
})

const agentOf = (extra: Partial<AgentRecord> = {}): AgentRecord => ({ id: 'a1', type: 'Explore', description: 'Review auth flow', state: 'running', startedAt: AT - 45_000, ...extra })

const subagent = (status: Status, extra: Partial<AgentRecord> = {}): Extract<RowItem, { kind: 'subagent' }> => ({ kind: 'subagent', id: 'a1', group: 'working', status, agent: agentOf(extra) })

const wagent = (extra: Partial<WorkflowAgent> = {}): WorkflowAgent => ({ id: 'w1', index: 1, label: 'verify:band.ts', type: 'master-session:reviewer', state: 'running', startedAt: AT - 45_000, ...extra })

const runOf = (agents: WorkflowAgent[], extra: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: 'wf_1',
  name: 'review-changes',
  description: '',
  phases: [],
  state: 'running',
  startedAt: AT - 360_000,
  agents,
  counts: { total: agents.length, running: agents.filter(one => one.state === 'running').length, done: agents.filter(one => one.state === 'done').length, failed: agents.filter(one => one.state === 'failed').length, asking: agents.filter(one => one.asking).length },
  tokens: 0,
  ...extra,
})

const workflow = (status: Status, run: WorkflowRun): Extract<RowItem, { kind: 'workflow' }> => ({ kind: 'workflow', id: run.id, group: 'working', status, run })

const inRun = (status: Status, run: WorkflowRun, agent: WorkflowAgent): Extract<RowItem, { kind: 'agent' }> => ({ kind: 'agent', id: agent.id, group: 'working', status, run, agent })

const archived = (extra: Partial<LiveSession> = {}, board?: Partial<BoardSession>): Extract<RowItem, { kind: 'archived' }> => ({ kind: 'archived', id: 's1', group: 'done', status: 'archived', one: live({ isArchived: true, lastActivityAt: AT - 7_200_000, ...extra }), board: board && ({ id: 's1', name: 'env', state: 'done', ...board } as BoardSession) })

const text = (item: RowItem, context: Context = ctx()) => statusSentenceOf(item, context, HOME).text

const running = (tool: string, runText?: string): Running => ({ tool, text: runText, since: AT - 3_000 })

const PARENT = rowOf({}, { startedBy: SELF }, 'p1')

test('R1: every item status gives its state word and glyph, queued reads waiting and unmerged reads done', () => {
  const all: [Status, string, Status][] = [
    ['needs', 'needs you', 'needs'],
    ['working', 'running', 'working'],
    ['waiting', 'waiting', 'waiting'],
    ['ready', 'waiting', 'waiting'],
    ['queued', 'waiting', 'waiting'],
    ['idle', 'waiting', 'idle'],
    ['verified', 'done', 'done'],
    ['merged', 'done', 'done'],
    ['done', 'done', 'done'],
    ['unmerged', 'done', 'done'],
    ['failed', 'failed', 'failed'],
    ['archived', 'archived', 'archived'],
  ]
  expect(all.map(([status]) => [status, stateWordOf(status).text, stateWordOf(status).glyph])).toEqual(all)
})

test('R2: the starter is the immediate starter only, per kind', () => {
  expect(starterOf(session('working'), ctx())).toBe('Validator')
  expect(starterOf(session('working', {}, { isOwn: false }), ctx())).toBe('')
  expect(starterOf(archived(), ctx())).toBe('Validator')
  expect(starterOf(archived({ startedBy: 'someone' }), ctx())).toBe('')
  const run = runOf([wagent()])
  expect(starterOf(workflow('working', run), ctx())).toBe('Validator')
  expect(starterOf(workflow('working', { ...run, parentSessionId: 'p1' }), ctx({ rows: [PARENT] }))).toBe('Implementer')
  expect(starterOf(workflow('working', { ...run, parentSessionId: 'gone' }), ctx({ rows: [PARENT] }))).toBe('Validator')
  expect(starterOf(inRun('working', run, run.agents[0] as WorkflowAgent), ctx())).toBe('Workflow')
  expect(starterOf(subagent('working'), ctx())).toBe('Validator')
  expect(starterOf(subagent('working', { parentSessionId: 'p1' }), ctx({ rows: [PARENT] }))).toBe('Implementer')
})

test('R2: a two-deep subagent reads its parent agent only, never a chain', () => {
  const architect = agentOf({ id: 'ar', type: 'master-session:architect', parentSessionId: 'p1' })
  const scout = agentOf({ id: 'a1', type: 'Explore', parentAgentId: 'ar' })
  const deeper = agentOf({ id: 'a2', type: 'master-session:researcher', parentAgentId: 'a1' })
  const context = ctx({ agents: [architect, scout, deeper], rows: [PARENT] })
  expect(starterOf({ kind: 'subagent', id: 'a1', group: 'working', status: 'working', agent: scout }, context)).toBe('Architect')
  expect(starterOf({ kind: 'subagent', id: 'a2', group: 'working', status: 'working', agent: deeper }, context)).toBe('Explore')
})

test('nameIdentOf gives the whole name and the ident line of each kind', () => {
  const long = 'x'.repeat(300)
  expect(nameIdentOf(session('working', { persona: 'Implementer' }), ctx())).toEqual({ full: 'Implementer · Env task', ident: 'session env · started by this master' })
  expect(nameIdentOf(session('working', {}, { isOwn: false }), ctx()).ident).toBe('session env · started by you')
  expect(nameIdentOf(subagent('working', { name: long, type: 'master-session:researcher' }), ctx())).toEqual({ full: `Researcher · ${long}`, ident: 'subagent master-session:researcher' })
  const run = runOf([wagent()])
  expect(nameIdentOf(inRun('working', run, wagent()), ctx())).toEqual({ full: 'Code reviewer · verify:band.ts', ident: 'workflow agent master-session:reviewer' })
  expect(nameIdentOf(workflow('working', run), ctx())).toEqual({ full: 'Workflow · review-changes', ident: 'workflow review-changes · run wf_1' })
  expect(nameIdentOf(archived(), ctx()).ident).toBe('session env · archived')
})

test('taskOf gives the done text, pending, nothing after a give-up, and nothing for a session the user started', () => {
  expect(taskOf(session('working'), ctx({ tasks: { s1: { state: 'done', text: 'Build the pane.' } } }))).toEqual({ text: 'Build the pane.' })
  expect(taskOf(session('working'), ctx({ tasks: { s1: { state: 'pending' } } }))).toBe('pending')
  expect(taskOf(session('working'), ctx())).toBeUndefined()
  expect(taskOf(session('working'), ctx({ tasks: { s1: { state: 'done' } } }))).toBeUndefined()
  expect(taskOf(session('working', {}, { isOwn: false }), ctx({ tasks: { s1: { state: 'pending' } } }))).toBeUndefined()
  expect(taskOf(subagent('working', { task: { state: 'done', text: 'Map it.' } }), ctx())).toEqual({ text: 'Map it.' })
  expect(taskOf(subagent('working', { task: { state: 'pending' } }), ctx())).toBe('pending')
  expect(taskOf(subagent('working'), ctx())).toBeUndefined()
  expect(taskOf(workflow('working', runOf([], { task: { state: 'done', text: 'Review it.' } })), ctx())).toEqual({ text: 'Review it.' })
  expect(taskOf(inRun('working', runOf([wagent()]), wagent({ task: { state: 'pending' } })), ctx())).toBe('pending')
  expect(taskOf(archived(), ctx({ tasks: { s1: { state: 'done', text: 'Old.' } } }))).toEqual({ text: 'Old.' })
  expect(taskOf(archived({ startedBy: 'someone' }), ctx({ tasks: { s1: { state: 'done', text: 'Old.' } } }))).toBeUndefined()
})

test('partOfOf names the run and the agent place, with no phase', () => {
  const run = runOf([wagent({ id: 'w1' }), wagent({ id: 'w2' }), wagent({ id: 'w3' })])
  expect(partOfOf(inRun('working', run, run.agents[1] as WorkflowAgent))).toEqual(['Workflow · review-changes', 'agent 2 of 3'])
})

test('R4 session: needs you answers in its chat, the Open chat hint only for a session this master started, a question in quotes', () => {
  const ask = { needsYou: 'Allow Bash: ls -la /tmp' }
  expect(statusSentenceOf(session('needs', ask), ctx(), HOME)).toEqual({ text: 'Needs you: it asks to use Bash. Answer in its chat (Open chat on the top row).', isAlert: true })
  expect(text(session('needs', { needsYou: 'Allow Bash' }))).toBe('Needs you: it asks to use Bash. Answer in its chat (Open chat on the top row).')
  expect(text(subagent('needs', { asking: { text: 'Allow Bash', since: AT } }))).toBe('Needs you: it asks to use Bash. Answer in this chat.')
  expect(text(inRun('needs', runOf([wagent()]), wagent({ asking: { text: 'Allow Bash', since: AT } })))).toBe('Needs you: it asks to use Bash. Answer in this chat.')
  expect(text(session('needs', ask, { isOwn: false }))).toBe('Needs you: it asks to use Bash. Answer in its chat.')
  expect(text(session('needs', { needsYou: 'Approve the settings.json edit' }))).toBe('Needs you: it asks “Approve the settings.json edit”. Answer in its chat (Open chat on the top row).')
  expect(text(session('needs', { needsYou: 'npm run build && deploy' }))).toBe('Needs you: it is waiting for your answer. Answer in its chat (Open chat on the top row).')
})

test('R4 session: running shows the live tool, a path folded, a URL host only, any other text as a command, and the step', () => {
  const step = { progress: 'step 2 of 5 — fix pass' }
  const withTool = (tool: Running, board: Partial<BoardSession> = {}) => text(session('working', board), ctx({ running: { s1: tool } }))
  expect(withTool(running('Read', `${HOME}/Work/a/b/c/d.ts`), step)).toBe('Running Read on ~/…/c/d.ts for 3s, step 2 of 5: fix pass.')
  expect(withTool(running('Read', `${HOME}/a/b`))).toBe('Running Read on ~/a/b for 3s.')
  expect(withTool(running('Bash', 'npm test --silent'))).toBe('Running a Bash command for 3s.')
  expect(withTool(running('Bash'))).toBe('Running a Bash command for 3s.')
  expect(withTool(running('Bash', `${HOME}/a/b`))).toBe('Running a Bash command for 3s.')
  expect(withTool(running('WebFetch', 'https://x.dev/a?token=1'))).toBe('Running WebFetch on x.dev for 3s.')
  expect(withTool(running('WebFetch', 'https://ghp_SECRET123@github.com/o/r'))).toBe('Running WebFetch on github.com for 3s.')
  expect(withTool(running('WebFetch', 'https://alice:pw@example.com/x'))).toBe('Running WebFetch on example.com for 3s.')
  expect(withTool(running('WebFetch', 'https://'))).toBe('Running a WebFetch command for 3s.')
  expect(withTool(running('Read', 'some odd words'))).toBe('Running a Read command for 3s.')
  expect(withTool(running('Read', `${HOME}/x.ts ; rm y`))).toBe('Running a Read command for 3s.')
  expect(withTool(running('Grep'))).toBe('Running Grep for 3s.')
  expect(text(session('working', step), ctx())).toBe('Running: fix pass.')
  expect(text(session('working', { now: 'compiling' }), ctx())).toBe('Running: compiling.')
  expect(text(session('working'), ctx())).toBe('Running.')
})

test('R4 session: waiting on its own subagents names them in quotes and gives the first sentence of the child task, never its prompt', () => {
  const child = (id: string, name: string, extra: Partial<AgentRecord> = {}) => agentOf({ id, name, parentSessionId: 's1', prompt: 'SECRET PROMPT text', ...extra })
  const one = ctx({ agents: [child('c1', 'Static analysis: game and sys.path', { task: { state: 'done', text: 'Map the imports before planning. Then report.' } })] })
  expect(text(session('waiting'), one)).toBe('Waiting for its subagent “Static analysis: game and sys.path” to finish: Map the imports before planning.')
  expect(text(session('waiting'), ctx({ agents: [child('c1', 'Run git status && ls', { type: 'scout' })] }))).toBe('Waiting for its subagent “scout” to finish.')
  expect(text(session('waiting'), ctx({ agents: [child('c1', 'ran npm run build'), child('c2', 'deploy --token abc')] }))).toBe('Waiting for its 2 subagents “Explore” and “Explore” to finish.')
  expect(text(session('waiting'), ctx({ agents: [child('c1', 'scout')] }))).toBe('Waiting for its subagent “scout” to finish.')
  expect(text(session('waiting'), ctx({ agents: [child('c1', 'scout', { task: { state: 'done', text: 'git push --force now' } })] }))).toBe('Waiting for its subagent “scout” to finish.')
  expect(text(session('waiting'), ctx({ agents: [child('c1', 'a'), child('c2', 'b')] }))).toBe('Waiting for its 2 subagents “a” and “b” to finish.')
  expect(text(session('waiting'), ctx({ agents: [child('c1', 'a', { state: 'done' }), child('c2', 'b', { parentAgentId: 'c1' })] }))).toBe('Waiting.')
})

test('R4 session: waiting shows Now, ready names the sha, branch and the checks it reported, idle shows the last activity', () => {
  expect(text(session('waiting', { now: 'waiting for the go' }))).toBe('Waiting: waiting for the go.')
  expect(text(session('waiting'))).toBe('Waiting.')
  const trees = [repo()]
  const ready = { sha: 'abc1234', tests: ['tsc -p . · ok', 'jest · 2 failed', 'claude plugin test · 226 passed'] }
  expect(text(session('ready', ready), ctx({ trees }))).toBe('Waiting for QA: ready at abc1234 on feat/x; 2 checks passed.')
  expect(text(session('ready', { sha: 'abc1234', tests: ['npm test · 3 passed'] }), ctx({ trees }))).toBe('Waiting for QA: ready at abc1234 on feat/x; 1 check passed.')
  expect(text(session('ready', { sha: 'abc1234', tests: ['jest · 2 failed'] }), ctx({ trees }))).toBe('Waiting for QA: ready at abc1234 on feat/x.')
  expect(text(session('ready', { sha: 'abc1234' }), ctx({ trees }))).toBe('Waiting for QA: ready at abc1234 on feat/x.')
  expect(text(session('ready', { sha: 'abc1234' }), ctx())).toBe('Waiting for QA: ready at abc1234.')
  expect(text(session('idle', { activity: ['committed db8ea4d · 2m ago'] }), ctx())).toBe('Idle for 5m; last: committed db8ea4d.')
  expect(text(session('idle'), ctx())).toBe('Idle for 5m.')
})

test('R4 session: verified, merged, work to keep, done text and not verified', () => {
  expect(text(session('verified', { sha: 'abc1234' }))).toBe('Verified at abc1234 and waiting for the merge.')
  const merged = ctx({ trees: [repo({ onBase: ['abc1234'] })] })
  expect(text(session('merged', { sha: 'abc1234' }), merged)).toBe('Done: merged to main at abc1234.')
  const keep = ctx({ trees: [repo({}, { unmerged: 2 })] })
  expect(text(session('done', { done: 'Built the pane' }), keep)).toBe('Done, but 2 commits not on main.')
  const clean = ctx({ trees: [repo()] })
  expect(text(session('done', { done: 'Built the pane.' }), clean)).toBe('Done: Built the pane.')
  expect(text(session('done'), clean)).toBe('Done; not verified.')
  expect(text(session('done', { done: 'npm test' }), clean)).toBe('Done; not verified.')
})

test('R4 session: a risk ends the sentence on a red-tint ground, a risk carrying command text is left out', () => {
  expect(statusSentenceOf(session('verified', { sha: 'abc1234', risk: 'key handling unproven on old shells' }), ctx(), HOME)).toEqual({ text: 'Verified at abc1234 and waiting for the merge; risk: key handling unproven on old shells.', isAlert: true })
  expect(statusSentenceOf(session('working', { risk: 'rm -rf the cache' }), ctx(), HOME)).toEqual({ text: 'Running.', isAlert: false })
  expect(statusSentenceOf(session('working'), ctx(), HOME).isAlert).toBe(false)
})

test('R4 subagent and workflow agent: running, waiting on a child, needs you, done and failed', () => {
  const tool = (value: Running) => ctx({ running: { a1: value } })
  expect(text(subagent('working'))).toBe('Running for 45s.')
  expect(text(subagent('working'), tool(running('Bash', SECRET)))).toBe('Running a Bash command for 3s.')
  expect(text(subagent('working'), tool(running('Read', `${HOME}/src/a.ts`)))).toBe('Running Read on ~/src/a.ts for 3s.')
  const child = agentOf({ id: 'c1', name: 'token-finder', parentAgentId: 'a1', task: { state: 'done', text: 'Find where tokens are read. More.' }, prompt: 'SECRET PROMPT' })
  expect(text(subagent('waiting'), ctx({ agents: [child] }))).toBe('Waiting for its subagent “token-finder” to finish: Find where tokens are read.')
  const here = ctx({ rows: [PARENT] })
  expect(text(subagent('needs', { asking: { text: `Allow Bash: ${SECRET}`, since: AT }, parentSessionId: 'p1' }), here)).toBe('Needs you: it asks to use Bash. Answer in Implementer · Env task’s chat.')
  expect(text(subagent('needs', { asking: { text: 'Which branch?', since: AT } }), here)).toBe('Needs you: it asks “Which branch?”. Answer in this chat.')
  const run = runOf([wagent()], { parentSessionId: 'p1' })
  expect(text(inRun('needs', run, wagent({ asking: { text: 'Allow Read: /x', since: AT } })), here)).toBe('Needs you: it asks to use Read. Answer in Implementer · Env task’s chat.')
  const done = { startedAt: AT - 125_000, endedAt: AT, result: 'Found 12 calls.\nignored second line', tokens: 9400 }
  expect(text(subagent('done', { state: 'done', ...done }))).toBe('Done in 2m 05s: Found 12 calls. Used 9.4k tokens.')
  expect(text(subagent('done', { state: 'done', startedAt: AT - 5_000, endedAt: AT }))).toBe('Done in 5s.')
  expect(text(subagent('done', { state: 'done', ...done, result: SECRET }))).toBe('Done in 2m 05s. Used 9.4k tokens.')
})

test('R4 subagent failed: the first line of the reason, nothing when it carries command text, a stop note when there is none', () => {
  const failed = { state: 'failed' as const, startedAt: AT - 60_000, endedAt: AT }
  expect(statusSentenceOf(subagent('failed', { ...failed, result: 'agent() threw: timed out\nmore' }), ctx(), HOME)).toEqual({ text: 'Failed after 1m 00s: agent() threw: timed out.', isAlert: true })
  expect(text(subagent('failed', { ...failed, result: SECRET }))).toBe('Failed after 1m 00s.')
  expect(text(subagent('failed', failed))).toBe('Failed after 1m 00s; it stopped without an answer.')
})

test('R4 workflow run: starting, running, needs you, failed and done', () => {
  expect(text(workflow('working', runOf([])))).toBe('Starting: no agent has started yet.')
  const mixed = runOf([wagent({ id: 'w1', state: 'done' }), wagent({ id: 'w2' }), wagent({ id: 'w3' })])
  expect(text(workflow('working', mixed))).toBe('Running: 1 of 3 agents done.')
  const asking = wagent({ id: 'w2', asking: { text: `Allow Bash: ${SECRET}`, since: AT } })
  const needs = runOf([wagent({ id: 'w1', state: 'done' }), asking])
  expect(statusSentenceOf(workflow('needs', needs), ctx(), HOME)).toEqual({ text: 'Needs you: Code reviewer · verify:band.ts asks to use Bash. Answer in this chat.', isAlert: true })
  expect(text(workflow('needs', { ...needs, parentSessionId: 'p1' }), ctx({ rows: [PARENT] }))).toBe('Needs you: Code reviewer · verify:band.ts asks to use Bash. Answer in Implementer · Env task’s chat.')
  const failed = runOf([wagent({ id: 'w1', state: 'done' }), wagent({ id: 'w2', state: 'failed', result: 'agent() threw: timed out' }), wagent({ id: 'w3', state: 'done' })], { state: 'failed' })
  expect(text(workflow('failed', failed))).toBe('Failed: verify:band.ts threw “agent() threw: timed out”; 2 of 3 agents finished.')
  const bad = runOf([wagent({ id: 'w1', state: 'failed', result: SECRET })], { state: 'failed' })
  expect(text(workflow('failed', bad))).toBe('Failed: verify:band.ts failed; 0 of 1 agents finished.')
  const done = runOf([wagent({ state: 'done' }), wagent({ id: 'w2', state: 'done' })], { state: 'done', endedAt: AT })
  expect(text(workflow('done', done))).toBe('Done in 6m 00s: 2 of 2 agents finished.')
})

test('R4 archived: the age, after QA when verified, and the worktree note only when it is gone', () => {
  expect(text(archived(), ctx())).toBe('Archived 2h ago.')
  expect(text(archived({}, { verified: 'QA passed' }), ctx())).toBe('Archived 2h ago, after QA passed.')
  expect(text(archived({ cwd: '/w/repo-x' }, { verified: 'ok' }), ctx({ trees: [repo()] }))).toBe('Archived 2h ago, after QA passed.')
  expect(text(archived({ cwd: '/w/gone' }), ctx({ trees: [repo()] }))).toBe('Archived 2h ago; its worktree was removed and is made again on its next turn.')
})

test('activityWordsOf gives at most 3 lines, newest first, drops command lines and reads a Bash event as the tool name', () => {
  const row = rowOf({ activity: ['ran Bash: git push --force · 2m ago', 'ran npm run build: ok · 1m ago', 'ran tsc -p . · 3m ago', 'committed db8ea4d · 5m ago', 'asked to use Bash · now', 'ran the plugin tests: 226 passed · 7m ago'] })
  expect(activityWordsOf(row)).toEqual([
    { text: 'ran Bash', ago: '2m ago', isGood: false },
    { text: 'committed db8ea4d', ago: '5m ago', isGood: false },
    { text: 'asked to use Bash', ago: 'now', isGood: false },
  ])
  expect(activityWordsOf({ ...row, board: undefined })).toEqual([])
})

test('isCommandText catches operators, flags, assignments and program words, and passes plain sentences', () => {
  for (const command of ['a && b', 'a || b', 'ls | wc', 'a; b', 'x > y', 'echo $(date)', 'a `b`', 'tsc -p .', 'run --all', 'TOKEN=abc go', 'git status', 'npm test', 'sudo reboot', 'export A', 'ran npm run build: ok', 'ran npm run build', 'Run git status && ls', 'deploy --token abc', SECRET]) expect([command, isCommandText(command)]).toEqual([command, true])
  for (const plain of ['Approve the plan', 'Map the imports before planning', 'merged to main', 'claude plugin test', 'Found 12 calls.', 'Static analysis: game and sys.path', 'Waiting for the review to finish']) expect([plain, isCommandText(plain)]).toEqual([plain, false])
})

test('AC30 sweep: no sentence of any kind or state carries a command or its secret', () => {
  const hot = { needsYou: `Allow Bash: ${SECRET}`, now: SECRET, progress: `step 1 of 2 — ${SECRET}`, done: SECRET, risk: SECRET, activity: [`${SECRET} · now`], tests: [`${SECRET} · 3 passed`] }
  const run = runOf([wagent({ asking: { text: `Allow Bash: ${SECRET}`, since: AT }, result: SECRET }), wagent({ id: 'w2', state: 'failed', result: SECRET })], { state: 'failed' })
  const child = agentOf({ id: 'c1', name: 'scout', parentAgentId: 'a1', parentSessionId: 's1', task: { state: 'done', text: SECRET }, prompt: SECRET })
  const context = ctx({ agents: [child], rows: [PARENT], trees: [repo()], running: { s1: running('Bash', SECRET), a1: running('Bash', SECRET), w1: running('Bash', SECRET) } })
  const statuses: Status[] = ['needs', 'working', 'waiting', 'idle', 'ready', 'verified', 'merged', 'done']
  const items: RowItem[] = [
    ...statuses.map(status => session(status, { sha: 'abc1234', ...hot })),
    ...(['needs', 'working', 'waiting', 'done', 'failed'] as const).map(status => subagent(status, { state: status === 'working' || status === 'needs' || status === 'waiting' ? 'running' : status === 'failed' ? 'failed' : 'done', result: SECRET, asking: { text: `Allow Bash: ${SECRET}`, since: AT } })),
    ...(['needs', 'working', 'failed', 'done'] as const).map(status => workflow(status, run)),
    inRun('needs', run, run.agents[0] as WorkflowAgent),
    inRun('failed', run, run.agents[1] as WorkflowAgent),
    archived(),
  ]
  const all = JSON.stringify([...items.map(item => text(item, context)), activityWordsOf(rowOf(hot))])
  for (const secret of ['X40', 'password', 'ARGS', 'mysql', '&&']) expect([secret, all.includes(secret)]).toEqual([secret, false])
})
