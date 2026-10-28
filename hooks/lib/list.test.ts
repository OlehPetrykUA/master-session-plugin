import { expect, test } from 'claude-code/testing'

import type { AgentRecord, Board, LiveSession, Repo, WorkflowRecord } from '../../types'

import { liveOf } from '../testing/world'
import { I, PERSONA_GLYPH } from '../theme/icons'
import { modelFamilyOf } from './format'
import { CH, bodyWidthOf } from './layout'
import { ARCHIVED_PEEK, ageOf, archivedItemOf, blocksOf, chatTargetOf, countsOfItems, isStartedBy, displayNameOf, groupsOf, isAllDone, itemsOf, kindOfType, lineOf, listedRowsOf, nameText, personaOfType, relativeOf, runAgentsOf, runStatusOf, sessionStatusOf, shownArchived, shownDots } from './list'
import type { Context, ListItem, RowItem } from './list'
import type { Row } from './rows'
import { elapsedOf, rowsOf } from './rows'
import { rowFitOf } from './rowfit'
import { dotExtraOf, dotWidthOf, tileInnerOf } from './sections'
import { starterOf, stateWordOf } from './status'
import { runSummaryOf } from './totals'

const NOW = 10_000_000

const board: Board = {
  sessions: [
    { id: 'a', name: 'env-e2e-test', state: 'needs-you', needsYou: 'Commit blocked' },
    { id: 'b', name: 'mod', state: 'working', progress: 'step 3 of 5 — build pane' },
    { id: 'c', name: 'pr', state: 'waiting', now: 'waiting on PR review' },
    { id: 'd', name: 'done', state: 'done', done: 'merged to main', progress: 'step 5 of 5 — ship' },
  ],
  needsYou: [],
  repos: [],
  source: 'tool',
}

const agents: AgentRecord[] = [
  { id: 'x1', type: 'Explore', description: 'Review auth flow', model: 'claude-haiku-5-5', requestedModel: 'haiku', state: 'running', startedAt: NOW - 180_000 },
  { id: 'x2', name: 'token-finder', type: 'master-session:researcher', description: 'Find token usages', model: 'claude-sonnet-5-5', state: 'done', startedAt: NOW - 300_000, endedAt: NOW - 180_000 },
  { id: 'w1', type: 'workflow-subagent', description: 'review:bugs', run: { id: 'wf_1', index: 1 }, state: 'done', startedAt: NOW - 360_000, endedAt: NOW - 300_000 },
  { id: 'w2', type: 'workflow-subagent', description: 'verify:band.ts', run: { id: 'wf_1', index: 2 }, state: 'failed', startedAt: NOW - 300_000, endedAt: NOW - 240_000 },
  { id: 'w3', type: 'workflow-subagent', description: 'verify:atoms.ts', run: { id: 'wf_1', index: 3 }, state: 'running', startedAt: NOW - 200_000 },
]

const workflows: WorkflowRecord[] = [{ id: 'wf_1', toolUseId: 't', name: 'review-changes', description: 'Review the branch', phases: ['Review', 'Verify', 'Report'], startedAt: NOW - 363_000 }]

const archived = (count: number): LiveSession[] => Array.from({ length: count }, (_, index) => ({ id: `z${index}`, name: `old-${index}`, title: '', cwd: '/', isRunning: false, isArchived: true, lastActivityAt: NOW - 7_200_000 }))

const items = itemsOf(rowsOf(board, liveOf()), agents, workflows)

test('a board row named after an agent or a workflow is dropped, so no row is drawn twice', () => {
  const named: Board = { ...board, sessions: [...board.sessions, { id: 'x1', name: 'scout', state: 'working' }, { id: 'w3', name: 'verify', state: 'working' }, { id: 'x2', name: 'finder', state: 'done' }, { id: 'wf_1', name: 'flow', state: 'done' }] }
  const ids = itemsOf(rowsOf(named, liveOf()), agents, workflows).map(item => [item.kind, item.id])
  expect(ids).toEqual(items.map(item => [item.kind, item.id]))
  const later = itemsOf(rowsOf(named, liveOf()), agents, workflows, { at: NOW + 86_400_000 }).map(item => item.id)
  expect(later.filter(id => ['x1', 'x2', 'w3', 'wf_1'].includes(id))).toEqual(['wf_1', 'x1', 'x2'])
  const totalOf = (rows: Row[]) => runSummaryOf({ rows, sessions: [], agents, workflows, board: named, trees: [], at: NOW }).plan.sessions
  const all = rowsOf(named, liveOf())
  expect(all.length).toBeGreaterThan(rowsOf(board, liveOf()).length)
  expect(totalOf(listedRowsOf(all, agents, workflows))).toBe(totalOf(rowsOf(board, liveOf())))
  expect(listedRowsOf(all, agents, workflows).map(row => row.id)).toEqual(items.filter(item => item.kind === 'session').map(item => item.id))
})

test('a finished subagent or workflow stays listed however long ago it ended; only Clear done hides it', () => {
  const late = NOW + 86_400_000
  const finished = agents.map(one => (one.state === 'running' ? { ...one, state: 'done' as const, endedAt: NOW - 1 } : one))
  const ids = (cleared?: number) => itemsOf(rowsOf(board, liveOf()), finished, workflows, { at: late, cleared }).map(item => item.id)
  expect(ids()).toContain('x2')
  expect(ids()).toContain('wf_1')
  expect(ids(late)).not.toContain('x2')
  expect(ids(late)).not.toContain('wf_1')
})

test('Done lists the newest finish first', () => {
  const done = (id: string, endedAt: number): AgentRecord => ({ id, type: 'Explore', description: id, state: 'done', startedAt: 1, endedAt })
  const groups = groupsOf(itemsOf([], [done('old', 10), done('new', 30), done('mid', 20)], [], { at: NOW }), [], 'done', 'closed')
  expect(groups.at(-1)?.items.map(item => item.id)).toEqual(['new', 'mid', 'old'])
})

test('Done sorts the newest finish first across sessions, workflows and subagents, not by kind', () => {
  const own = liveOf()
  const finished: Row = { id: 'sess', name: 'sess', title: '', state: 'done', live: { ...own.sessions[0]!, isRunning: false, lastActivityAt: 20 } }
  const helper: AgentRecord = { id: 'sub', type: 'Explore', description: 'sub', state: 'done', startedAt: 1, endedAt: 30 }
  const member: AgentRecord = { id: 'wm', type: 'workflow-subagent', description: 'wm', state: 'done', startedAt: 1, endedAt: 10, run: { id: 'wf', index: 1 } }
  const flow: WorkflowRecord = { id: 'wf', toolUseId: 't', name: 'flow', startedAt: 1 }
  const groups = groupsOf(itemsOf([finished], [helper, member], [flow], { at: NOW }), [], 'done', 'closed')
  expect(groups.at(-1)?.items.map(item => item.id)).toEqual(['sub', 'sess', 'wf'])
})

test('Open chat targets only a needs-you session this session started, the sessions open_session_in accepts', () => {
  const own = liveOf()
  const mine: Row = { id: 'a', name: 'a', title: '', state: 'needs-you', live: { ...own.sessions[0]!, startedBy: own.self } }
  const theirs: Row = { ...mine, live: { ...mine.live!, startedBy: 'someone-else' } }
  const chatOf = (row: Row, self?: string) => itemsOf([row], [], [], { self }).map(chatTargetOf)
  expect(chatOf(mine, own.self)).toEqual([mine])
  expect(chatOf(theirs, own.self)).toEqual([undefined])
  expect(chatOf(mine)).toEqual([undefined])
  expect([isStartedBy(mine.live, own.self), isStartedBy(theirs.live, own.self), isStartedBy(mine.live, undefined), isStartedBy(undefined, own.self)]).toEqual([true, false, false, false])
})

test('a finished session stops its clock at its last activity; a running one counts to now', () => {
  const live = { ...liveOf().sessions[0]!, createdAt: NOW - 3_600_000, lastActivityAt: NOW - 1_800_000 }
  const row = (isRunning: boolean): Row => ({ id: 'a', name: 'a', title: '', state: 'done', live: { ...live, isRunning } })
  expect(elapsedOf(row(true), NOW)).toBe('1h 0m')
  expect(elapsedOf(row(false), NOW)).toBe('30m')
  expect(elapsedOf(row(false), NOW + 7_200_000)).toBe('30m')
})

test('the list holds sessions, then workflows, then subagents; each lands in its state group, finished agents in Done; workflow agents are no items', () => {
  expect(items.map(item => [item.kind, item.id, item.group])).toEqual([
    ['session', 'a', 'needs-you'],
    ['session', 'c', 'waiting'],
    ['session', 'b', 'working'],
    ['session', 'd', 'done'],
    ['workflow', 'wf_1', 'working'],
    ['subagent', 'x1', 'working'],
    ['subagent', 'x2', 'done'],
  ])
  expect(countsOfItems(items, 3)).toEqual({ all: 7, 'needs-you': 1, working: 3, waiting: 1, done: 2, archived: 3 })
  expect(isAllDone(items)).toBe(false)
  expect(isAllDone(items.filter(item => item.group === 'done'))).toBe(true)
  expect(isAllDone([])).toBe(false)
})

test('groups: All lists Needs you, Working, Waiting, Done and a closed Archived; a filter pins Needs you above its own group; the Archived chip opens it', () => {
  const ids = (chosen: Parameters<typeof groupsOf>[2], view: Parameters<typeof groupsOf>[3] = 'closed', old = archived(3)) =>
    groupsOf(items, old, chosen, view).map(group => [group.id, group.items.length, group.isPinned, group.isOpen])
  expect(ids('all')).toEqual([
    ['needs-you', 1, false, true],
    ['working', 3, false, true],
    ['waiting', 1, false, true],
    ['done', 2, false, true],
    ['archived', 0, false, false],
  ])
  expect(ids('all', 'open', [])).toEqual(ids('all').slice(0, 4))
  expect(ids('waiting')).toEqual([
    ['needs-you', 1, true, true],
    ['waiting', 1, false, true],
  ])
  expect(ids('needs-you')).toEqual([['needs-you', 1, false, true]])
  expect(ids('archived')).toEqual([
    ['needs-you', 1, true, true],
    ['archived', 0, false, true],
  ])
  const [open] = groupsOf(items, archived(5), 'all', 'open').filter(group => group.id === 'archived')
  expect(shownArchived(open!, 'open', 'all').length).toBe(ARCHIVED_PEEK)
  expect(shownArchived(open!, 'all', 'all').length).toBe(5)
  expect(shownArchived(open!, 'closed', 'archived').length).toBe(5)
})

const context: Context = { at: NOW, trees: [], sessions: [], agents, rows: rowsOf(board, liveOf()) }

const said = (item: RowItem, at = context) => [item.status, nameText(displayNameOf(item)), `${starterOf(item, at) ? `${starterOf(item, at)} › ` : ''}${stateWordOf(item.status).text}`]

test('every kind names itself persona · task and says its starter and state word; a session this master did not start has no starter', () => {
  const of = (id: string) => items.find(item => item.id === id)!
  expect(['a', 'b', 'c', 'd', 'wf_1', 'x1', 'x2'].map(id => said(of(id)))).toEqual([
    ['needs', 'Session · env-e2e-test', 'needs you'],
    ['working', 'Session · mod', 'running'],
    ['waiting', 'Session · pr', 'waiting'],
    ['done', 'Session · done', 'done'],
    ['working', 'Workflow · review-changes', 'Validator › running'],
    ['working', 'Explore · Review auth flow', 'Validator › running'],
    ['done', 'Researcher · token-finder', 'Validator › done'],
  ])
  expect(lineOf(of('d') as ListItem, context)).toEqual({ word: { status: 'unmerged', text: 'unmerged' }, text: 'git state unknown' })
  const run = items.find(item => item.kind === 'workflow')
  expect(run?.kind === 'workflow' ? runAgentsOf(run.run, agents).map(one => said(one)) : []).toEqual([
    ['done', 'Agent · review:bugs', 'Workflow › done'],
    ['failed', 'Agent · verify:band.ts', 'Workflow › failed'],
    ['working', 'Agent · verify:atoms.ts', 'Workflow › running'],
  ])
  const done = itemsOf([], agents.map(agent => ({ ...agent, state: 'done' as const, endedAt: agent.endedAt ?? NOW })), workflows).find(item => item.kind === 'workflow')
  expect(said(done!)).toEqual(['done', 'Workflow · review-changes', 'Validator › done'])
  expect(lineOf(done as ListItem, context)).toEqual({ word: { status: 'done', text: 'done' }, text: '3 of 3 agents' })
  expect([kindOfType('a:b:c'), kindOfType('Explore'), modelFamilyOf('claude-opus-5-5'), modelFamilyOf('haiku'), modelFamilyOf(undefined)]).toEqual(['c', 'Explore', 'opus', 'haiku', ''])
  const personas = ['implementer', 'refactorer', 'reviewer', 'qa-verifier', 'design-checker', 'researcher', 'designer', 'architect', 'validator'].map(type => personaOfType(`master-session:${type}`))
  expect(personas.map(persona => PERSONA_GLYPH[persona] && PERSONA_GLYPH[persona] in I)).toEqual(personas.map(() => true))
  expect([personaOfType('general-purpose'), personaOfType('workflow-subagent'), personaOfType('master-session:qa-verifier'), personaOfType('Explore'), personaOfType('')]).toEqual(['Agent', 'Agent', 'QA verifier', 'Explore', 'Subagent'])
  expect([personaOfType('master-session:architect'), PERSONA_GLYPH.Architect]).toEqual(['Architect', 'architect'])
})

test('a session reads idle, ready, verified or merged from its live state, board and worktree; a persona on the board or the title names it', () => {
  const live = { id: 's', name: 's', title: 'Implementer · Savvy removal', cwd: '/r/wt', isRunning: false, isArchived: false, lastActivityAt: 0 }
  const row = (state: Row['state'], board: Partial<NonNullable<Row['board']>> = {}): Row => ({ id: 's', name: 's', title: '', state, board: { id: 's', name: 's', state, ...board }, live })
  const tree = (unmerged: number, dirty = 0, onBase: string[] = []): Repo[] => [{ path: '/r', name: 'r', localOnly: 0, base: 'main', onBase, worktrees: [{ path: '/r/wt', branch: 'b', sha: 'abc', isMain: false, dirty, paths: [], upstream: '', ahead: 0, behind: 0, unmerged }] }]
  expect([
    sessionStatusOf(row('working')),
    sessionStatusOf(row('waiting', { now: 'idle since 11:02' })),
    sessionStatusOf(row('waiting', { now: 'waiting on review' })),
    sessionStatusOf(row('done', { sha: 'abc' })),
    sessionStatusOf(row('done', { sha: 'abc', verified: 'PASS' })),
    sessionStatusOf(row('done', { sha: 'abc' }), tree(0, 0, ['abc'])),
    sessionStatusOf(row('done', { sha: 'abc' }), tree(2)),
    sessionStatusOf(row('done', { sha: 'abc' }), tree(0, 1, ['abc'])),
    sessionStatusOf(row('done', { sha: 'abc' }), tree(0)),
    sessionStatusOf(row('done')),
  ]).toEqual(['idle', 'idle', 'waiting', 'ready', 'verified', 'merged', 'ready', 'ready', 'ready', 'done'])
  const main = (branch: string, dirty = 0): Repo[] => [{ path: '/r/wt', name: 'r', localOnly: 0, base: 'main', onBase: ['abc'], worktrees: [{ path: '/r/wt', branch, sha: 'abc', isMain: true, dirty, paths: [], upstream: '', ahead: 0, behind: 0, unmerged: 0 }] }]
  expect([
    sessionStatusOf(row('done', { sha: 'abc' }), main('main')),
    sessionStatusOf(row('done'), main('main')),
    sessionStatusOf(row('done', { sha: 'abc' }), main('feature')),
    sessionStatusOf(row('done', { sha: 'abc' }), main('main', 1)),
  ]).toEqual(['merged', 'done', 'merged', 'ready'])
  const item = (one: Row, trees: Repo[] = []): RowItem => ({ kind: 'session', id: 's', group: one.state, status: sessionStatusOf(one, trees), row: one })
  expect(said(item(row('done', { sha: 'abc' }), tree(0, 0, ['abc'])), { ...context, trees: tree(0, 0, ['abc']) })).toEqual(['merged', 'Implementer · Savvy removal', 'done'])
  expect(displayNameOf(item({ ...row('working', { persona: 'Designer' } as object), live: { ...live, title: 'canvas v3' } }))).toEqual({ persona: 'Designer', task: 'canvas v3' })
  expect(displayNameOf({ kind: 'master' })).toEqual({ persona: 'Validator', task: '' })
})

test('subagents name their parent chain: the parent session by persona, an earlier parent folds into …; a parent-less agent belongs to the Validator', () => {
  const rows: Row[] = [{ id: 'w', name: 'w', title: 'Implementer · Row details', state: 'working' }]
  const tree: AgentRecord[] = [
    { id: 'p', type: 'master-session:qa-verifier', description: 'verify a38c72e', state: 'running', startedAt: NOW - 60_000, parentSessionId: 'w' },
    { id: 'k', type: 'master-session:reviewer', description: 'review a38c72e', state: 'running', startedAt: NOW - 30_000, parentAgentId: 'p', asking: { text: 'Allow Bash: rm -rf dist?', since: NOW - 40_000 } },
  ]
  const nested: Context = { ...context, rows, agents: tree }
  const list = itemsOf(rows, tree, [], {})
  const line = (id: string) => {
    const [status, , word] = said(list.find(item => item.id === id)!, nested)
    return [status, word]
  }
  expect(line('p')).toEqual(['waiting', 'Implementer › waiting'])
  expect(line('k')).toEqual(['needs', 'QA verifier › needs you'])
})

test('a run with an agent asking turns needs-you, names the asking agent with its question and reds that agent row; counts.asking alone also flags it', () => {
  const [run] = itemsOf([], agents, workflows).filter(item => item.kind === 'workflow')
  if (run?.kind !== 'workflow') throw new Error('no run')
  const asking = { ...run.run, agents: run.run.agents.map(one => (one.index === 3 ? { ...one, type: 'master-session:reviewer', asking: { text: 'Allow Bash: rm -rf dist?', since: NOW } } : one)) }
  const item: RowItem = { ...run, status: runStatusOf(asking), run: asking }
  expect(said(item)).toEqual(['needs', 'Workflow · review-changes', 'Validator › needs you'])
  expect(runAgentsOf(asking, agents).map(one => one.status)).toEqual(['done', 'failed', 'needs'])
  expect(runStatusOf({ ...run.run, counts: { ...run.run.counts, asking: 1 } as typeof run.run.counts })).toBe('needs')
})

test('an archived session names itself from its board entry and says when it was archived', () => {
  const one: LiveSession = { id: 'z', name: 'z', title: 'old title', cwd: '/r/wt', isRunning: false, isArchived: true, lastActivityAt: NOW - 7_200_000 }
  const item = archivedItemOf(one, { ...board, sessions: [{ id: 'z', name: 'z', state: 'done', title: 'Implementer · Savvy removal' }] })
  expect(said(item)).toEqual(['archived', 'Implementer · Savvy removal', 'archived'])
  expect(said(archivedItemOf(one))).toEqual(['archived', 'Session · old title', 'archived'])
})

test('the run starts at the board since, so an older subagent does not pull duration back', () => {
  const HOUR = 3_600_000
  const old = [{ id: 'z1', type: 'Explore', description: 'scan', state: 'running' as const, startedAt: NOW - 2 * HOUR }]
  const only = runSummaryOf({ rows: [], sessions: [], agents: old, workflows: [], board: null, trees: [], at: NOW })
  expect(only.duration).toEqual({ since: NOW, ms: 0 })
  const fresh = { sessions: [], needsYou: [], repos: [], source: 'tool' as const, since: NOW - 60_000 }
  const withBoard = runSummaryOf({ rows: [], sessions: [], agents: old, workflows: [], board: fresh, trees: [], at: NOW })
  expect(withBoard.duration).toEqual({ since: NOW - 60_000, ms: 60_000 })
})

test('commits count what landed on the base since the run start when that is more than the workers reported', () => {
  const repo = { path: '/r', name: 'r', localOnly: 0, base: 'main', landed: 5, worktrees: [] }
  const sum = (landed: number) => runSummaryOf({ rows: [], sessions: [], agents: [], workflows: [], board: null, trees: [{ ...repo, landed }], at: NOW }).commits
  expect(sum(5)).toEqual({ total: 5, repos: 1 })
  expect(sum(0)).toEqual({ total: 0, repos: 1 })
})

test('summary blocks read the run totals as the design words them, zeros and dashes before any work', () => {
  const rows = rowsOf(board, liveOf())
  const totals = runSummaryOf({ rows, sessions: [], agents, workflows, board, trees: [], at: NOW })
  const blocks = blocksOf(totals, true)
  expect(blocks.map(block => [block.label, block.value, block.sub, block.isAlert])).toEqual([
    ['Plan', '—', 'no plan yet', false],
    ['Needs you', '1', '1 waiting', true],
    ['Agents', '3', '2 working · 1 done', false],
    ['Commits', '0', 'none yet', false],
    ['Tests', '—', 'none reported', false],
    ['Duration', '<1m', expect.stringMatching(/^since \d\d:\d\d$/), false],
    ['Git', '0', 'clean', false],
    ['Tokens', '0', 'agents only', false],
  ])
  expect(blocks[2]?.bad).toBeUndefined()
  expect(blocksOf(totals, true, '20:04')[5]?.sub).toMatch(/^\d\d:\d\d – 20:04$/)
  expect(blocksOf(totals, true, '20:04')[5]?.shorts).toEqual(['until 20:04', '20:04'])
  const asking = [...agents, { id: 'ask1', type: 'master-session:reviewer', description: 'Review the diff', state: 'running' as const, startedAt: NOW, asking: { text: 'Allow Bash: npm test', since: NOW } }, { id: 'ask2', type: 'workflow-subagent', description: 'scan', state: 'running' as const, startedAt: NOW, run: { id: 'wf_x', index: 0 }, asking: { text: 'Allow Read: a', since: NOW } }, { id: 'ask3', type: 'workflow-subagent', description: 'scan 2', state: 'running' as const, startedAt: NOW, run: { id: 'wf_x', index: 1 }, asking: { text: 'Allow Read: b', since: NOW } }]
  const needs = runSummaryOf({ rows, sessions: [], agents: asking, workflows, board, trees: [], at: NOW })
  expect(needs.needsYou).toBe(countsOfItems(itemsOf(rows, asking, workflows, { at: NOW }), 0)['needs-you'])
  expect(needs.needsYou).toBe(3)
  expect(blocksOf(needs, true)[1]).toEqual(expect.objectContaining({ value: '3', sub: '3 waiting', isAlert: true }))
  expect(blocksOf({ ...needs, needsYou: 0 }, true)[1]).toEqual(expect.objectContaining({ value: '0', sub: 'nothing waiting', shorts: ['none'], isAlert: false }))
  const empty = blocksOf(runSummaryOf({ rows: [], sessions: [], agents: [], workflows: [], board: null, trees: [], at: NOW }), false)
  expect(empty.map(block => [block.value, block.sub])).toEqual([
    ['—', 'no plan yet'],
    ['0', 'nothing waiting'],
    ['0', 'none yet'],
    ['0', 'none yet'],
    ['—', 'none reported'],
    ['—', 'not started'],
    ['0', 'clean'],
    ['0', 'agents only'],
  ])
})

test('ages read like the design: just now, minutes, hours, days', () => {
  expect([ageOf(10_000), ageOf(5 * 60_000), ageOf(2 * 3_600_000 + 60_000), ageOf(3 * 86_400_000)]).toEqual(['just now', '5m ago', '2h ago', '3d ago'])
})

test('relative paths: under a root, else under home as ~, and an empty home changes nothing', () => {
  expect(relativeOf('/home/me/wt/hooks/a.ts', ['/home/me/wt'], '/home/me')).toBe('hooks/a.ts')
  expect(relativeOf('/home/me/notes/b.md', ['/home/me/wt'], '/home/me')).toBe('~/notes/b.md')
  expect(relativeOf('~/notes/b.md', ['/home/me/notes'], '/home/me')).toBe('b.md')
  expect(relativeOf('/Users/x/c.ts', [], '')).toBe('/Users/x/c.ts')
  expect(relativeOf('~/c.ts', [], '')).toBe('~/c.ts')
})

test('finished subagents and runs stay listed whatever their age; a launch with no agents for two minutes is debris', () => {
  const idle = { ...agents[0]!, state: 'done' as const, endedAt: NOW - 119_000 }
  const old = { ...agents[1]!, endedAt: NOW - 3_600_000 }
  const kinds = (list: AgentRecord[], runs: WorkflowRecord[] = []) => itemsOf([], list, runs, { at: NOW }).map(item => item.id)
  expect(kinds([idle, old])).toEqual(['x1', 'x2'])
  expect(kinds(agents, workflows)).toEqual(['wf_1', 'x1', 'x2'])
  const finished = agents.map(agent => ({ ...agent, state: 'done' as const, endedAt: NOW - 3_600_000 }))
  expect(kinds(finished, workflows)).toEqual(['wf_1', 'x1', 'x2'])
  expect(kinds([], workflows)).toEqual([])
  expect(itemsOf([], [], workflows, { at: NOW - 263_000 }).map(item => item.id)).toEqual(['wf_1'])
})

test('a done session with a sha is ready: the chips and the groups both count it as waiting', () => {
  const ready: Board = { ...board, sessions: [{ id: 'r', name: 'ready-one', state: 'done', sha: 'abc1234', done: 'built' }] }
  const rows = rowsOf(ready, liveOf())
  const items = itemsOf(rows, [], [])
  expect(items.map(item => [item.status, item.group])).toEqual([['ready', 'waiting']])
  expect(countsOfItems(items, 0)).toEqual({ all: 1, 'needs-you': 0, working: 0, waiting: 1, done: 0, archived: 0 })
})

test('a needs-you row with a long question stays 56 tall at every width, and the tile counts needs-you apart', () => {
  const long = 'Allow Bash: git push origin main --force-with-lease and then delete the remote branch and every tag that points at it, please confirm'
  const asking: Board = { ...board, sessions: [{ id: 'q', name: 'asker', state: 'needs-you', needsYou: long }] }
  const rows = rowsOf(asking, liveOf())
  const [item] = itemsOf(rows, [], [])
  const context: Context = { at: NOW, trees: [], sessions: [], agents: [], rows }
  expect([rowFitOf(item!, context, { width: 360, isNarrow: false, chat: 'Open chat' }).height, rowFitOf(item!, context, { width: 1500, isNarrow: false, chat: 'Open chat' }).height]).toEqual([56, 56])
  expect(runSummaryOf({ rows, sessions: [], agents: [], workflows: [], board: asking, trees: [], at: NOW }).needsYou).toBe(1)
})

test('the Plan tile reads the board pieces as done/total with working, verifying and queued dots; dropped pieces count in neither', () => {
  const planned: Board = { ...board, plan: [{ name: 'a', state: 'done' }, { name: 'b', state: 'working' }, { name: 'c', state: 'verifying' }, { name: 'd', state: 'queued' }, { name: 'e', state: 'queued' }, { name: 'f', state: 'dropped' }] }
  const rows = rowsOf(planned, liveOf())
  const tile = blocksOf(runSummaryOf({ rows, sessions: [], agents: [], workflows: [], board: planned, trees: [], at: NOW }), true)[0]!
  expect([tile.value, tile.chats]).toEqual(['1/5', 4])
  expect(tile.dots).toEqual([
    { tone: 'green', count: 1 },
    { tone: 'amber', count: 1 },
    { tone: 'grey', count: 2 },
  ])
  const all = blocksOf(runSummaryOf({ rows, sessions: [], agents: [], workflows: [], board: { ...planned, plan: [{ name: 'a', state: 'done' }] }, trees: [], at: NOW }), true)[0]!
  expect([all.value, all.sub, all.dots]).toEqual(['1/1', 'all done', undefined])
})

test('the Sessions tile dots drop zero buckets and wrap inside the tile: known line counts at 41, 47 and 60 columns', () => {
  const tile = (counts: number[]) => ({ key: 'sessions', label: 'Sessions', value: '0', sub: '', isAlert: false, dots: (['red', 'green', 'amber', 'grey'] as const).map((tone, index) => ({ tone, count: counts[index] ?? 0 })) })
  expect(shownDots(tile([1, 0, 1, 0])).map(mark => mark.tone)).toEqual(['red', 'amber'])
  const innerOf = (columns: number) => tileInnerOf(bodyWidthOf(columns), columns * CH < 340 ? 3 : 4)
  const linesAt = (counts: number[], columns: number) => dotExtraOf(tile(counts), innerOf(columns)) / 16 + 1
  expect([41, 47, 60].map(columns => linesAt([12, 3, 7, 1], columns))).toEqual([2, 2, 1])
  expect([41, 47, 60].map(columns => linesAt([88, 77, 66, 55], columns))).toEqual([2, 2, 2])
  expect([41, 47, 60].map(columns => linesAt([1, 0, 0, 0], columns))).toEqual([1, 1, 1])
  expect([41, 47, 60].map(columns => linesAt([0, 0, 0, 0], columns))).toEqual([1, 1, 1])
  expect(dotExtraOf(undefined, 100)).toBe(0)
  for (const columns of [41, 47, 60]) expect([columns, dotExtraOf(tile([88, 0, 0, 0]), innerOf(columns))]).toEqual([columns, 0])
  expect(dotExtraOf(tile([12, 3, 7, 1]), innerOf(41))).toBe(16)
  const two = 2 * dotWidthOf(1) + 4
  expect([dotExtraOf(tile([1, 1, 0, 0]), two), dotExtraOf(tile([1, 1, 0, 0]), two - 0.5)]).toEqual([0, 16])
})
