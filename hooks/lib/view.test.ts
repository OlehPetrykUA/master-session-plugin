import { expect, test } from 'claude-code/testing'

import type { PaneData } from '../components/types'
import { AGENT_SHOWN_MS } from './constants'
import { compactOf } from './format'
import { itemsOf } from './list'
import { headerButtonsOf, paneViewOf, statusOf } from './view'
import { runSetOf, runSummaryOf } from './totals'

const dataOf = (rows: number) => ({ rows: Array.from({ length: rows }, () => ({})), asked: null, columns: 60, isRefreshing: false }) as unknown as PaneData

test('Ask for updates shows only when worker sessions exist: subagents report on their own', () => {
  const ids = (rows: number) => headerButtonsOf(dataOf(rows), () => undefined, () => undefined).map(one => one.id)
  expect(ids(0)).toEqual(['refresh'])
  expect(ids(2)).toEqual(['ask', 'refresh'])
})

const headerOf = (extra: Record<string, unknown>) => statusOf({ at: 100_000, live: { at: 1_000 }, agents: [], workflows: [], archived: [], asked: null, isRefreshing: false, ...extra } as unknown as PaneData, false).text

test('the header reads the newest change: every source moves it, and with none it counts from the session list', () => {
  expect(headerOf({})).toBe(`updated ${compactOf(99_000)} ago`)
  expect(headerOf({ workflows: [{ id: 'wf', startedAt: 99_000 }] })).toBe('updated just now')
  expect(headerOf({ agents: [{ id: 'a', startedAt: 99_500, state: 'running' }] })).toBe('updated just now')
  expect(headerOf({ agents: [{ id: 'a', startedAt: 1_000, endedAt: 99_500, state: 'done' }] })).toBe('updated just now')
  expect(headerOf({ board: { at: 99_500 } })).toBe('updated just now')
  expect(headerOf({ agents: [{ id: 'a', startedAt: 1_000, state: 'running', asking: { text: 'q', since: 99_500 } }] })).toBe('updated just now')
})

test('the Duration tile stops at the board time once the run is done, so its value matches its start – end line', () => {
  const rows = [{ id: 'w', name: 'w', title: '', state: 'done' }]
  const agents: never[] = []
  const at = 1_000_000 + 7_200_000
  const board = { tick: '09:00', at: 1_000_000 + 600_000, since: 1_000_000, sessions: [], needsYou: [], repos: [], source: 'tool' as const }
  const data = (now: number) =>
    ({
      board,
      live: { self: 's', sessions: [], at: 0, title: '', error: '' },
      trees: [],
      rows,
      archived: [],
      agents,
      workflows: [],
      items: itemsOf(rows as never, agents, [], { at: now }),
      running: {},
      totals: runSummaryOf({ rows: rows as never, sessions: [], agents, workflows: [], board, trees: [], at: now }),
      chosen: 'all',
      open: [],
      archiveView: 'closed',
      cleared: 0,
      at: now,
      columns: 100,
      isNarrativeOpen: false,
    }) as unknown as PaneData
  const duration = (now: number) => paneViewOf(data(now)).blocks.find(one => one.key === 'duration')
  expect(duration(at)?.value).toBe('10m')
  expect(duration(at + 3_600_000)?.value).toBe('10m')
})

const viewOf = (extra: Record<string, unknown>) => {
  const agents = [{ id: 'x2', type: 'Explore', description: 'Find usages', state: 'done', startedAt: 1_000, endedAt: 2_000 }]
  const at = 2_000 + AGENT_SHOWN_MS * 30
  const board = { sessions: [], needsYou: [], repos: [], source: 'tool' as const, since: 500 }
  const live = { self: 's', sessions: [], at: 0, title: '', error: '' }
  const set = runSetOf({ board, live, agents: agents as never, workflows: [], at })
  return paneViewOf({
    board,
    live,
    trees: [],
    rows: set.rows,
    archived: set.archived,
    agents: set.agents,
    workflows: set.workflows,
    items: set.items,
    running: {},
    totals: runSummaryOf({ rows: set.rows, sessions: [], agents: set.agents, workflows: [], board, trees: [], at, items: set.items }),
    chosen: 'all',
    open: [],
    archiveView: 'closed',
    cleared: 0,
    at,
    columns: 100,
    isNarrativeOpen: false,
    ...extra,
  } as unknown as PaneData)
}

test('a finished subagent stays in Done however old, and the Done chip and the Agents tile count it', () => {
  const view = viewOf({})
  expect(view.items.map(one => one.id)).toEqual(['x2'])
  expect(view.chips.find(chip => chip.id === 'done')?.count).toBe(1)
  expect(view.blocks.find(block => block.key === 'agents')).toEqual(expect.objectContaining({ value: '1', sub: '1 done' }))
})

test('the Archived chip is drawn only when something is archived, and the archived filter falls back to All without it', () => {
  const view = viewOf({ chosen: 'archived' })
  expect(view.chips.map(chip => chip.id)).toEqual(['all', 'needs-you', 'working', 'waiting', 'done'])
  expect(view.chosen).toBe('all')
  const archived = [{ id: 'z', name: 'z', title: '', cwd: '/', isRunning: false, isArchived: true, lastActivityAt: 0 }]
  const shown = viewOf({ chosen: 'archived', archived })
  expect(shown.chips.at(-1)).toEqual(expect.objectContaining({ id: 'archived', count: 1 }))
  expect(shown.chosen).toBe('archived')
})
