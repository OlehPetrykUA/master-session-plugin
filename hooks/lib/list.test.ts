import { expect, test } from 'claude-code/testing'

import type { AgentRecord, Board, LiveSession, Repo, WorkflowRecord } from '../../types'

import { liveOf } from '../testing/world'
import { I, PERSONA_GLYPH } from '../theme/icons'
import { modelFamilyOf } from './format'
import { CH, bodyWidthOf } from './layout'
import { ARCHIVED_PEEK, ageOf, archivedItemOf, blocksOf, countsOfItems, displayNameOf, groupsOf, isAllDone, itemsOf, kindOfType, lineOf, lineTextOf, nameText, personaOfType, relativeOf, runAgentsOf, runStatusOf, sessionStatusOf, shownArchived, shownDots } from './list'
import type { Context, RowItem } from './list'
import type { Row } from './rows'
import { rowsOf } from './rows'
import { rowFitOf } from './rowfit'
import { dotExtraOf, dotWidthOf, tileInnerOf } from './sections'
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

const said = (item: RowItem, at = context) => [item.status, nameText(displayNameOf(item)), lineTextOf(lineOf(item, at))]

test('every kind names itself persona · task and says its state word and current line; a needs line is the question', () => {
  const of = (id: string) => items.find(item => item.id === id)!
  expect(['a', 'b', 'c', 'd', 'wf_1', 'x1', 'x2'].map(id => said(of(id)))).toEqual([
    ['needs', 'Session · env-e2e-test', 'Commit blocked'],
    ['working', 'Session · mod', 'build pane'],
    ['waiting', 'Session · pr', 'waiting · waiting on PR review'],
    ['done', 'Session · done', 'unmerged · git state unknown'],
    ['working', 'Workflow · review-changes', 'verify:atoms.ts'],
    ['working', 'Explore · Review auth flow', 'Validator › running'],
    ['done', 'Researcher · token-finder', 'Validator › done'],
  ])
  expect(lineOf(of('a'), context).isQuestion).toBe(true)
  const run = items.find(item => item.kind === 'workflow')
  expect(run?.kind === 'workflow' ? runAgentsOf(run.run, agents).map(one => said(one)) : []).toEqual([
    ['done', 'Agent · review:bugs', 'done'],
    ['failed', 'Agent · verify:band.ts', 'failed'],
    ['working', 'Agent · verify:atoms.ts', 'running'],
  ])
  const done = itemsOf([], agents.map(agent => ({ ...agent, state: 'done' as const, endedAt: agent.endedAt ?? NOW })), workflows).find(item => item.kind === 'workflow')
  expect(said(done!)).toEqual(['done', 'Workflow · review-changes', 'done · 3 of 3 agents'])
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
  expect(said(item(row('done', { sha: 'abc' }), tree(0, 0, ['abc'])), { ...context, trees: tree(0, 0, ['abc']) })).toEqual(['merged', 'Implementer · Savvy removal', 'merged to main · abc'])
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
  const line = (id: string) => lineOf(list.find(item => item.id === id)!, nested)
  expect([list.find(item => item.id === 'p')?.status, line('p')]).toEqual(['waiting', { chain: 'Implementer ›', word: { status: 'waiting', text: 'waiting' }, text: 'on Code reviewer · review a38c72e', isQuestion: false }])
  expect([list.find(item => item.id === 'k')?.status, line('k')]).toEqual(['needs', { chain: '… › QA verifier ›', text: 'Allow Bash: rm -rf dist?', isQuestion: true }])
})

test('a run with an agent asking turns needs-you, names the asking agent with its question and reds that agent row; counts.asking alone also flags it', () => {
  const [run] = itemsOf([], agents, workflows).filter(item => item.kind === 'workflow')
  if (run?.kind !== 'workflow') throw new Error('no run')
  const asking = { ...run.run, agents: run.run.agents.map(one => (one.index === 3 ? { ...one, type: 'master-session:reviewer', asking: { text: 'Allow Bash: rm -rf dist?', since: NOW } } : one)) }
  const item: RowItem = { ...run, status: runStatusOf(asking), run: asking }
  expect(said(item)).toEqual(['needs', 'Workflow · review-changes', 'Code reviewer asks: Allow Bash: rm -rf dist?'])
  expect(runAgentsOf(asking, agents).map(one => one.status)).toEqual(['done', 'failed', 'needs'])
  expect(runStatusOf({ ...run.run, counts: { ...run.run.counts, asking: 1 } as typeof run.run.counts })).toBe('needs')
})

test('an archived session names itself from its board entry and says when it was archived', () => {
  const one: LiveSession = { id: 'z', name: 'z', title: 'old title', cwd: '/r/wt', isRunning: false, isArchived: true, lastActivityAt: NOW - 7_200_000 }
  const item = archivedItemOf(one, { ...board, sessions: [{ id: 'z', name: 'z', state: 'done', title: 'Implementer · Savvy removal' }] })
  expect(said(item)).toEqual(['archived', 'Implementer · Savvy removal', 'archived 2h ago'])
  expect(said(archivedItemOf(one))).toEqual(['archived', 'Session · old title', 'archived 2h ago'])
})

test('the run starts at the earliest of the board, the sessions and the subagents, so duration and since agree', () => {
  const HOUR = 3_600_000
  const old = [{ id: 'z1', type: 'Explore', description: 'scan', state: 'running' as const, startedAt: NOW - 2 * HOUR }]
  const only = runSummaryOf({ rows: [], sessions: [], agents: old, workflows: [], board: null, trees: [], at: NOW })
  expect(only.duration).toEqual({ since: NOW - 2 * HOUR, ms: 2 * HOUR })
  const fresh = { sessions: [], needsYou: [], repos: [], source: 'tool' as const, since: NOW - 60_000 }
  const withBoard = runSummaryOf({ rows: [], sessions: [], agents: old, workflows: [], board: fresh, trees: [], at: NOW })
  expect(withBoard.duration.since).toBe(NOW - 2 * HOUR)
  const none = runSummaryOf({ rows: [], sessions: [], agents: [], workflows: [], board: fresh, trees: [], at: NOW })
  expect(none.duration.since).toBe(NOW - 60_000)
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
    ['Sessions', '4', '', false],
    ['Needs you', '1', '1 session', true],
    ['Subagents', '2', '1 running', false],
    ['Workflows', '1', '2/3 agents', false],
    ['Commits', '0', '—', false],
    ['Tests', '—', 'none reported', false],
    ['Duration', '6m', expect.stringMatching(/^since \d\d:\d\d$/), false],
    ['Git', '0', 'clean', false],
  ])
  expect(blocksOf(totals, true, '20:04')[6]?.sub).toMatch(/^\d\d:\d\d – 20:04$/)
  expect(blocksOf(totals, true, '20:04')[6]?.shorts).toEqual(['until 20:04', '20:04'])
  expect(blocksOf({ ...totals, subagents: { total: 2, running: 0, done: 2, failed: 0, asking: 0 } }, true)[2]?.sub).toBe('all finished')
  const asking = [...agents, { id: 'ask1', type: 'master-session:reviewer', description: 'Review the diff', state: 'running' as const, startedAt: NOW, asking: { text: 'Allow Bash: npm test', since: NOW } }, { id: 'ask2', type: 'workflow-subagent', description: 'scan', state: 'running' as const, startedAt: NOW, run: { id: 'wf_x', index: 0 }, asking: { text: 'Allow Read: a', since: NOW } }, { id: 'ask3', type: 'workflow-subagent', description: 'scan 2', state: 'running' as const, startedAt: NOW, run: { id: 'wf_x', index: 1 }, asking: { text: 'Allow Read: b', since: NOW } }]
  const needs = runSummaryOf({ rows, sessions: [], agents: asking, workflows, board, trees: [], at: NOW })
  expect(needs.needsYou).toEqual({ sessions: 1, subagents: 2 })
  expect(blocksOf(needs, true)[1]).toEqual(expect.objectContaining({ value: '3', sub: '1 session · 2 subagents', isAlert: true }))
  expect(blocksOf({ ...needs, needsYou: { sessions: 2, subagents: 0 } }, true)[1]?.sub).toBe('2 sessions')
  expect(blocksOf({ ...needs, needsYou: { sessions: 0, subagents: 0 } }, true)[1]).toEqual(expect.objectContaining({ value: '0', sub: 'nothing waiting', shorts: ['none'], isAlert: false }))
  expect(blocks[0]?.dots).toEqual([
    { tone: 'red', count: 1 },
    { tone: 'green', count: 1 },
    { tone: 'amber', count: 1 },
    { tone: 'grey', count: 1 },
  ])
  const empty = blocksOf(runSummaryOf({ rows: [], sessions: [], agents: [], workflows: [], board: null, trees: [], at: NOW }), false)
  expect(empty.map(block => [block.value, block.sub])).toEqual([
    ['0', ''],
    ['0', 'nothing waiting'],
    ['0', 'none'],
    ['0', 'none'],
    ['0', '—'],
    ['—', 'none reported'],
    ['—', 'not started'],
    ['0', 'clean'],
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

test('the pane hides subagents and runs that finished two minutes ago; the stores keep them', () => {
  const idle = { ...agents[0]!, state: 'done' as const, endedAt: NOW - 119_000 }
  const old = { ...agents[1]!, endedAt: NOW - 120_000 }
  const kinds = (list: AgentRecord[], runs: WorkflowRecord[] = []) => itemsOf([], list, runs, { at: NOW }).map(item => item.id)
  expect(kinds([idle, old])).toEqual(['x1'])
  expect(itemsOf([], [idle, old], []).map(item => item.id)).toEqual(['x1', 'x2'])
  expect(kinds(agents, workflows)).toEqual(['wf_1', 'x1'])
  const finished = agents.map(agent => ({ ...agent, state: 'done' as const, endedAt: NOW - 120_000 }))
  expect(kinds(finished, workflows)).toEqual([])
  expect(kinds([], workflows)).toEqual([])
  expect(itemsOf([], [], workflows, { at: NOW - 263_000 }).map(item => item.id)).toEqual(['wf_1'])
})

test('a done session with a sha is ready: the Sessions tile, the chips and the groups all count it as waiting', () => {
  const ready: Board = { ...board, sessions: [{ id: 'r', name: 'ready-one', state: 'done', sha: 'abc1234', done: 'built' }] }
  const rows = rowsOf(ready, liveOf())
  const items = itemsOf(rows, [], [])
  const totals = runSummaryOf({ rows, sessions: [], agents: [], workflows: [], board: ready, trees: [], at: NOW })
  expect(items.map(item => [item.status, item.group])).toEqual([['ready', 'waiting']])
  expect([totals.sessions.waiting, totals.sessions.done, countsOfItems(items, 0).waiting]).toEqual([1, 0, 1])
})

test('a needs-you row with a two-line question is taller than 56, and the tile counts needs-you apart', () => {
  const long = 'Allow Bash: git push origin main --force-with-lease and then delete the remote branch and every tag that points at it, please confirm'
  const asking: Board = { ...board, sessions: [{ id: 'q', name: 'asker', state: 'needs-you', needsYou: long }] }
  const rows = rowsOf(asking, liveOf())
  const [item] = itemsOf(rows, [], [])
  const context: Context = { at: NOW, trees: [], sessions: [], agents: [], rows }
  expect([rowFitOf(item!, context, { width: 360, isNarrow: false, home: '/h', chat: 'Open chat' }).height, rowFitOf(item!, context, { width: 1500, isNarrow: false, home: '/h', chat: 'Open chat' }).height]).toEqual([72, 56])
  expect(runSummaryOf({ rows, sessions: [], agents: [], workflows: [], board: asking, trees: [], at: NOW }).needsYou.sessions).toBe(1)
})

test('the Sessions tile dots add up to its total: needs you, working, waiting and done', () => {
  const rows = rowsOf(board, liveOf())
  const totals = runSummaryOf({ rows, sessions: [], agents: [], workflows: [], board, trees: [], at: NOW })
  const tile = blocksOf(totals, true)[0]!
  expect(tile.dots?.map(mark => mark.tone)).toEqual(['red', 'green', 'amber', 'grey'])
  expect([tile.dots?.reduce((sum, mark) => sum + mark.count, 0), tile.value]).toEqual([4, '4'])
  expect(tile.dots?.map(mark => mark.count)).toEqual([1, 1, 1, 1])
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
