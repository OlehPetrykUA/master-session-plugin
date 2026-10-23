import { expect, test } from 'claude-code/testing'

import { CH, LH, down, faceWidth, liftOf, tall } from './layout'
import { BLOCK, ROW, chipWidthOf, contentHeightOf, headerPxOf, headerRowsOf, linesOf, noticePxOf, scrollMessage, scrollRowOf, sectionTopsOf, statusLinesOf, statusRoomOf } from './sections'
import type { SectionInput } from './sections'
import type { Board } from '../../types'
import type { PaneData } from '../components/types'
import { liveOf } from '../testing/world'
import { runSummaryOf } from './totals'
import { sectionsOf } from './view'

const chips = ['All', 'Needs you', 'Waiting', 'Working', 'Done', 'Archived'].map((label, index) => ({ label, count: index, hasMark: true, markWidth: index % 5 ? 8 : 14 }))

const input: SectionInput = {
  columns: 102,
  repos: ['~/dotfiles', 'toolkit'],
  isNarrow: false,
  notice: '',
  status: 'updated just now',
  buttons: ['Ask', 'Refresh'],
  narrativeRows: 0,
  hasNarrativeMore: false,
  blockRows: 2,
  blockExtra: 0,
  chips,
  groups: [
    { rows: 1, extra: 0, isArchived: false },
    { rows: 2, extra: 0, isArchived: false },
    { rows: 0, extra: 0, isArchived: true },
  ],
  hasMore: false,
  isEmpty: false,
  hasExpanded: false,
}

test('the pinned header is the 56 px header, the repos row and the rule; narrow adds the button row, offline the notice', () => {
  expect(headerPxOf(input)).toBe(56 + 24 + 12 + 1)
  expect(headerRowsOf(input)).toBe(Math.ceil((56 + 24 + 12 + 1) / LH))
  expect(headerPxOf({ ...input, isNarrow: true })).toBe(12 + 20 + 2 + 16 + 8 + 32 + 8 + 24 + 12 + 1)
  expect(headerPxOf({ ...input, notice: 'Can’t read sessions: board.json not found.' })).toBe(56 + 24 + 12 + 1 + 12 + 32)
  expect(noticePxOf('Can’t read sessions: board.json not found. Retrying in 30s.', 46)).toBe(12 + 16 + 2 * 16)
  expect(noticePxOf('', 46)).toBe(0)
  expect(headerPxOf({ ...input, repos: [] })).toBe(57)
})

test('D3 the narrative block is 12 + rows × 20 + 4 + 16, or 32 with More, before the summary, and the content height follows', () => {
  const header = headerRowsOf(input) * LH
  expect(sectionTopsOf(input)['section-narrative']).toBeUndefined()
  for (const [rows, hasMore, height] of [[2, false, 12 + 40 + 4 + 16], [3, true, 12 + 60 + 4 + 32]] as const) {
    const narrated = { ...input, narrativeRows: rows, hasNarrativeMore: hasMore }
    const tops = sectionTopsOf(narrated)
    expect(tops['section-narrative']).toBe(header)
    expect(tops['section-summary']).toBe(header + height)
    expect((contentHeightOf(narrated) ?? 0) - (contentHeightOf(input) ?? 0)).toBe(height)
  }
})

test('section tops follow the drawn layout: summary, chips, then the list with the archived group last', () => {
  const tops = sectionTopsOf(input)
  const header = headerRowsOf(input) * LH
  expect(tops['section-header']).toBe(0)
  expect(tops['section-summary']).toBe(header)
  expect(tops['section-chips']).toBe(header + 12 + 2 * BLOCK + 8)
  expect(tops['section-list']).toBe(header + 12 + 2 * BLOCK + 8 + 12 + 32)
  expect(tops['section-archived']).toBe((tops['section-list'] ?? 0) + 16 + (32 + 4 + ROW) + 16 + (32 + 4 + 2 * ROW + 4) + 16)
  expect(tops['section-expanded']).toBeUndefined()
  expect(sectionTopsOf({ ...input, hasExpanded: true })['section-expanded']).toBe(tops['section-list'])
  expect(scrollRowOf('section-header', 0, headerRowsOf(input))).toBe(0)
  expect(scrollRowOf('section-chips', tops['section-chips'] ?? 0, headerRowsOf(input))).toBe(Math.floor((12 + 2 * BLOCK + 8) / LH))
  expect((sectionTopsOf({ ...input, columns: 30 })['section-list'] ?? 0) > (tops['section-list'] ?? 0)).toBe(true)
})

test('chips wrap onto as many lines as the room needs', () => {
  const widths = chips.map(chipWidthOf)
  expect(linesOf(widths, 10_000, 8)).toBe(1)
  expect(linesOf(widths, Math.max(...widths), 8)).toBe(widths.length)
})

test('the scroll answer names the row the window landed on, and says when the content ended first', () => {
  expect(scrollMessage('section-list', 4, 2, 57)).toBe('Scrolled the pane to section-list: asked row 4, landed on row 2, the end of the content. The pane is 57 columns wide.')
  expect(scrollMessage('section-list', 4, 4, 57)).toBe('Scrolled the pane to section-list (row 4). The pane is 57 columns wide.')
  expect(scrollMessage('end', undefined, 2, 57)).toBe('Scrolled the pane to end: row 2. The pane is 57 columns wide.')
})

test('the header lift is one tree row per scroll row: the scroll cell is the tree row, so the pin lands exactly at any offset', () => {
  for (const offset of [0, 1, 9, 83, 400]) {
    expect(down(liftOf(offset))).toBe(offset * 2)
    expect(tall(liftOf(offset))).toBe(offset)
  }
})

test('content height is known only where every row has a fixed height: closed details, no empty box', () => {
  const top = sectionTopsOf({ ...input, columns: 101 })['section-list'] ?? 0
  expect(contentHeightOf(input)).toBe(top + 16 + (32 + 4 + ROW) + (32 + 4 + 2 * ROW + 4) + 32 + 2 * 16 + 16)
  expect(contentHeightOf({ ...input, groups: input.groups.map(group => ({ ...group, extra: group.rows ? 16 : 0 })) })).toBe((contentHeightOf(input) ?? 0) + 32)
  expect(contentHeightOf({ ...input, hasMore: true })).toBe((contentHeightOf(input) ?? 0) + 16 + 32)
  expect(contentHeightOf({ ...input, hasExpanded: true })).toBeUndefined()
  expect(contentHeightOf({ ...input, isEmpty: true })).toBeUndefined()
  expect(contentHeightOf({ ...input, groups: [] })).toBeUndefined()
})

test('a header status that wraps adds its extra lines to the header and moves every section below it', () => {
  const status = 'Asked the validator for a board update at 10:58 · it answers on its next tick and the pane refreshes by itself'
  const wide = { ...input, columns: 46, status }
  const lines = statusLinesOf(wide)
  expect(lines).toBeGreaterThan(2)
  expect(statusLinesOf({ ...wide, status: 'updated just now' })).toBe(1)
  expect(headerPxOf(wide) - headerPxOf({ ...wide, status: 'updated just now' })).toBe(20 + 2 + 16 * lines - 56)
  const narrow = { ...wide, isNarrow: true }
  expect(headerPxOf(narrow) - headerPxOf({ ...narrow, status: 'updated just now' })).toBe(16 * (statusLinesOf(narrow) - 1))
  expect((sectionTopsOf(wide)['section-summary'] ?? 0) - (sectionTopsOf({ ...wide, status: 'updated just now' })['section-summary'] ?? 0)).toBe((headerRowsOf(wide) - headerRowsOf({ ...wide, status: 'updated just now' })) * LH)
  expect(headerRowsOf(wide)).toBeGreaterThan(headerRowsOf({ ...wide, status: 'updated just now' }))
})

test('the header status room leaves the buttons their drawn width: each face plus 1 for the 16 px icon, and the gaps', () => {
  const px = (value: number) => Math.round(value * 100) / 100
  expect(px(statusRoomOf({ ...input, columns: 46 }))).toBe(px(46 * CH - 16 - 8 - 8 * 3 - (faceWidth('Ask', 'b32') + 1) - (faceWidth('Refresh', 'b32') + 1) - 12 - 4))
  expect(px(statusRoomOf({ ...input, columns: 46, isNarrow: true }))).toBe(px(46 * CH - 16 - 8 - 12 - 4))
})

test('a wrapped dot line pushes every section top below the tiles down by exactly that line', () => {
  const tops = sectionTopsOf(input)
  const shifted = sectionTopsOf({ ...input, blockExtra: 16 })
  for (const key of ['section-chips', 'section-list', 'section-archived'] as const) expect(shifted[key]).toBe((tops[key] ?? 0) + 16)
  expect(shifted['section-summary']).toBe(tops['section-summary'])
  expect(contentHeightOf({ ...input, blockExtra: 16 })).toBe((contentHeightOf(input) ?? 0) + 16)
})

test('the view of a board whose Sessions dots wrap moves the chips down one dot line more than a one-dot board: at 41 and 47 columns, not at 60', () => {
  const chipsGap = ([red, working, waiting, done]: number[], columns: number) => {
    const board: Board = { sessions: [], needsYou: [], repos: [], source: 'tool' }
    const totals = runSummaryOf({ rows: [], sessions: [], agents: [], workflows: [], board, trees: [], at: 10_000_000 })
    const counted = { ...totals, sessions: { total: red! + working! + waiting! + done!, working: working!, waiting: waiting!, done: done! }, needsYou: { ...totals.needsYou, sessions: red! } }
    const tops = sectionsOf({ board, live: liveOf(), trees: [], rows: [], archived: [], agents: [], workflows: [], totals: counted, chosen: 'all', open: [], asking: '', archiveView: 'open', asked: null, undone: null, isRefreshing: false, at: 10_000_000, home: '/h', columns, offset: 0, bodyRows: 60, isAligned: true } as unknown as PaneData)
    return (tops['section-chips'] ?? 0) - (tops['section-summary'] ?? 0)
  }
  expect([41, 47, 60].map(columns => chipsGap([12, 3, 7, 1], columns) - chipsGap([0, 1, 0, 0], columns))).toEqual([16, 16, 0])
})
