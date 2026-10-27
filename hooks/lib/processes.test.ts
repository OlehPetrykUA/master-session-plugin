import { expect, test } from 'claude-code/testing'

import { LSTART, proc } from '../testing/procs'
import { cpuText, cwdPidsOf, etimeOf, isPid, memText, modelOf, ownerPathOf, parseLoad, parseLsof, parsePs, processesPxOf, processesViewOf, signOf, timeText, worktreeOf } from './processes'
import type { Proc, ProcContext, ProcState } from './processes'
import { sectionTopsOf } from './sections'
import type { SectionInput } from './sections'

const HOME = '/home/me'
const K1 = `${HOME}/.claude/worktrees/wt-app-k1`
const K10 = `${HOME}/.claude/worktrees/wt-app-k10`

const row = (one: ReturnType<typeof proc>): Proc => ({ pid: one.pid, ppid: one.ppid, lstart: one.lstart ?? LSTART, cpu: one.cpu ?? 0, rss: one.rss ?? 1024, etime: etimeOf(one.etime ?? '00:10'), ucomm: one.ucomm })

const CONTEXT: ProcContext = { home: HOME, masterPid: 100, repos: ['app'], paths: [{ path: K1, owner: 'local_k1' }, { path: K10, owner: 'local_k10' }] }

test('AC8: cpu, memory and elapsed formats', () => {
  expect([cpuText(12.4), cpuText(230)]).toEqual(['12%', '230%'])
  expect([memText(86016), memText(1258291)]).toEqual(['84 MB', '1.2 GB'])
  expect([timeText(etimeOf('00:45')), timeText(etimeOf('04:05')), timeText(etimeOf('01:03:10')), timeText(etimeOf('2-01:00:00'))]).toEqual(['45s', '4m', '1h 3m', '49h 0m'])
})

test('ps lines parse with a padded start time, a program name with spaces and no arguments', () => {
  const out = parsePs('  955     1 Thu Aug  6 14:42:00 2026       0.0   6704 68-08:52:21 Google Chrome He   \n  12   955 Thu Aug 20 14:42:01 2026      12.5  86016    00:45 node\nnot a line\n')
  expect(out).toEqual([
    { pid: 955, ppid: 1, lstart: 'Thu Aug 6 14:42:00 2026', cpu: 0, rss: 6704, etime: 68 * 86400 + 8 * 3600 + 52 * 60 + 21, ucomm: 'Google Chrome He' },
    { pid: 12, ppid: 955, lstart: 'Thu Aug 20 14:42:01 2026', cpu: 12.5, rss: 86016, etime: 45, ucomm: 'node' },
  ])
})

test('lsof -Fpn output maps a pid to its working directory; sysctl output reads as the load line', () => {
  expect([...parseLsof('p530\nfcwd\nn/a b/c\np531\nfcwd\nn/d\n')]).toEqual([[530, '/a b/c'], [531, '/d']])
  expect(parseLoad('{ 18.30 14.48 15.09 }\n10\n')).toBe('18.3 · 14.5 · 15.1 · 10 cores')
  expect(parseLoad('garbage')).toBe('')
})

test('AC11: a cwd of wt-app-k10 never reads owner k1, and the longest whole-segment prefix wins', () => {
  expect(ownerPathOf(`${K10}/web`, CONTEXT.paths)?.owner).toBe('local_k10')
  expect(ownerPathOf(`${K1}/web/x`, CONTEXT.paths)?.owner).toBe('local_k1')
  expect(ownerPathOf(`${K1}-x`, CONTEXT.paths)).toBeUndefined()
  expect(ownerPathOf('/tmp', CONTEXT.paths)).toBeUndefined()
})

test('AC31: a left-behind worktree needs the board’s repo name followed by a dash', () => {
  const at = (cwd: string) => worktreeOf(cwd, CONTEXT)
  expect(at(`${K1}/web`)).toBe('wt-app-k1')
  expect([at(`${HOME}/Work/app`), at(`${HOME}/.claude/worktrees/wt-other-k1`), at(`${HOME}/.claude/worktrees/wt-apple-k1`), at('/tmp'), at(`${HOME}/.claude/worktrees`)]).toEqual(['', '', '', '', ''])
})

test('AC9: rows sort by CPU, then longest elapsed, then pid', () => {
  const table = [
    row(proc(100, 10, 'claude')),
    row(proc(120, 100, 'zsh')),
    row(proc(1, 120, 'node', { cpu: 5, etime: '00:10' })),
    row(proc(2, 120, 'node', { cpu: 40, etime: '00:30' })),
    row(proc(3, 120, 'node', { cpu: 40, etime: '02:00' })),
    row(proc(4, 120, 'node', { cpu: 40, etime: '02:00' })),
  ]
  const out = modelOf(table, new Map(), CONTEXT)
  expect(out.run.map(one => one.pid)).toEqual([3, 4, 2, 1])
})

test('R3, R2: a wrapper shell folds away; MCP servers, engines and the mod’s own children are no rows', () => {
  const table = [row(proc(100, 10, 'claude')), row(proc(110, 100, 'node')), row(proc(120, 100, 'zsh')), row(proc(130, 120, 'node')), row(proc(140, 100, 'ps')), row(proc(150, 100, 'zsh'))]
  const out = modelOf(table, new Map(), CONTEXT)
  expect(out.run.map(one => [one.pid, one.owner])).toEqual([[130, 'master'], [150, 'master']])
})

test('S3: engines, claude, Claude, disclaimer and the master’s ancestors never get a Stop', () => {
  const table = [
    row(proc(5, 1, 'Claude')),
    row(proc(10, 5, 'disclaimer')),
    row(proc(100, 10, 'claude')),
    row(proc(120, 100, 'zsh')),
    row(proc(121, 120, 'claude')),
    row(proc(122, 121, 'node')),
    row(proc(123, 120, 'Claude')),
    row(proc(124, 120, 'disclaimer')),
    row(proc(125, 120, 'node')),
  ]
  const out = modelOf(table, new Map(), CONTEXT)
  expect(out.run.map(one => [one.pid, one.canStop])).toEqual([[121, false], [122, true], [123, false], [124, false], [125, true]])
  expect(out.ancestors).toEqual([10, 5])
})

test('a claude engine under another claude is not a run engine, and a worker engine is found by its cwd', () => {
  const table = [row(proc(100, 10, 'claude')), row(proc(500, 10, 'claude')), row(proc(520, 500, 'zsh')), row(proc(530, 520, 'node')), row(proc(600, 520, 'claude')), row(proc(610, 600, 'zsh')), row(proc(611, 610, 'node'))]
  const out = modelOf(table, new Map([[500, `${K1}`], [600, `${K1}`]]), CONTEXT)
  expect(Object.keys(out.engines).map(Number)).toEqual([100, 500])
  expect(out.run.map(one => one.pid)).toEqual([530, 600, 610, 611])
  expect(out.run.map(one => one.owner)).toEqual(['local_k1', 'local_k1', 'local_k1', 'local_k1'])
})

test('R6: only parent-1 processes in a board repo’s worktree are left behind, with their children', () => {
  const table = [row(proc(100, 10, 'claude')), row(proc(950, 1, 'node')), row(proc(951, 950, 'node')), row(proc(960, 1, 'node')), row(proc(970, 1, 'node'))]
  const cwds = new Map([[950, `${K1}/web`], [960, `${HOME}/Work/app`], [970, `${HOME}/.claude/worktrees/wt-apple-k1`]])
  const out = modelOf(table, cwds, CONTEXT)
  expect(out.left.map(one => [one.pid, one.owner, one.worktree])).toEqual([[950, 'left:wt-app-k1', 'wt-app-k1'], [951, 'left:wt-app-k1', 'wt-app-k1']])
  expect(out.run).toEqual([])
})

test('F3: the cwd read covers engines, shells and their descendants, and parent-1 processes, and nothing else', () => {
  const table = [row(proc(1, 0, 'launchd')), row(proc(100, 10, 'claude')), row(proc(120, 100, 'zsh')), row(proc(130, 120, 'node')), row(proc(110, 100, 'node')), row(proc(300, 200, 'node')), row(proc(950, 1, 'node'))]
  expect(cwdPidsOf(table)).toEqual([100, 120, 130, 950])
})

test('S2: only integers above 1 are pids', () => {
  expect([1, 0, -1, 1.5, 2, 4211].map(isPid)).toEqual([false, false, false, false, true, true])
  expect([isPid('7'), isPid(NaN), isPid(undefined)]).toEqual([false, false, false])
})

const STATE: ProcState = { isOpen: true, isRead: true, load: '1.0 · 1.0 · 1.0 · 4 cores', error: '', run: [], left: [], asking: '', stopping: {}, notes: {} }

test('Q9: 15 shown rows become 12 and +3 more; the count is all of them', () => {
  const table = [row(proc(100, 10, 'claude')), row(proc(120, 100, 'zsh')), ...Array.from({ length: 15 }, (_, index) => row(proc(200 + index, 120, 'node', { cpu: index })))]
  const out = modelOf(table, new Map(), CONTEXT)
  const view = processesViewOf({ ...STATE, run: out.run }, {})
  expect([view.groups[0]?.rows.length, view.groups[0]?.more, view.count]).toEqual([12, 3, 15])
})

test('empty and error states', () => {
  expect(processesViewOf(STATE, {}).isEmpty).toBe(true)
  const failed = processesViewOf({ ...STATE, error: 'Can’t read processes: boom' }, {})
  expect([failed.isEmpty, failed.groups, failed.count]).toEqual([false, [], 0])
})

const INPUT: SectionInput = {
  columns: 60,
  repos: [],
  isNarrow: false,
  notice: '',
  status: 'x',
  buttons: [],
  narrativeRows: 0,
  hasNarrativeMore: false,
  blockRows: 2,
  blockExtra: 0,
  chips: [],
  groups: [],
  hasMore: false,
  isEmpty: true,
  hasExpanded: false,
}

test('the section takes its height between the summary tiles and the filter chips, and nothing when absent', () => {
  const without = sectionTopsOf(INPUT)
  const view = processesViewOf(STATE, {})
  const px = processesPxOf(view, 60)
  const with_ = sectionTopsOf({ ...INPUT, processesPx: px })
  expect(without['section-processes']).toBeUndefined()
  expect(with_['section-processes']).toBe(without['section-chips'])
  expect((with_['section-chips'] ?? 0) - (without['section-chips'] ?? 0)).toBe(px)
  expect(processesPxOf({ ...view, isOpen: false }, 60)).toBe(56)
})

test('F6: the redraw sign moves only when a visible text does', () => {
  const at = (etime: string, cpu = 5) => modelOf([row(proc(100, 10, 'claude')), row(proc(120, 100, 'zsh')), row(proc(130, 120, 'node', { cpu, etime }))], new Map(), CONTEXT)
  const sign = (etime: string, cpu?: number) => signOf('load', '', at(etime, cpu))
  expect(sign('02:14')).toBe(sign('02:10'))
  expect(sign('03:00')).not.toBe(sign('02:10'))
  expect(sign('02:10', 6)).not.toBe(sign('02:10'))
  expect(sign('02:14', 5.2)).toBe(sign('02:10', 5.4))
})
