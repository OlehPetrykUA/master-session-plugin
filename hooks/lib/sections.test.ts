import { expect, test } from 'claude-code/testing'

import { LH, TILE_HEIGHT, down, liftOf, tall } from './layout'
import { chipWidthOf, contentHeightOf, headerRowsOf, linesOf, scrollMessage, scrollRowOf, sectionTopsOf } from './sections'

const head = { title: 'Master session', status: 'updated just now', labels: ['Ask for updates', 'Refresh'] }

const chips = ['All', 'Needs you', 'Waiting', 'Working', 'Done', 'Archived'].map((label, index) => ({ label, count: index, hasMark: true, markWidth: index % 5 ? 7 : 14 }))

test('section tops follow the drawn layout: the pinned header block, chips, then the body', () => {
  const wide = sectionTopsOf({ columns: 102, header: head, repos: ['~/dotfiles', 'toolkit'], chips, hasError: false, body: 'tiles', hasExpanded: true })
  const header = headerRowsOf(102, ['~/dotfiles', 'toolkit'], head)
  expect(header).toBe(Math.ceil((52 + 26 + 8 + 1) / LH))
  expect(wide['section-header']).toBe(0)
  expect(wide['section-chips']).toBe(header * LH)
  expect(wide['section-tiles']).toBe(header * LH + 12 + 36 + 4 + 12)
  expect(wide['section-expanded']).toBe(wide['section-tiles'])
  expect(scrollRowOf('section-header', 0, header)).toBe(0)
  expect(scrollRowOf('section-chips', wide['section-chips'] ?? 0, header)).toBe(0)
  expect(scrollRowOf('section-tiles', wide['section-tiles'] ?? 0, header)).toBe(Math.floor((12 + 36 + 4 + 12) / LH))
  const narrow = sectionTopsOf({ columns: 30, header: head, repos: ['~/dotfiles', 'toolkit'], chips, hasError: false, body: 'tiles', hasExpanded: false })
  expect(narrow['section-tiles']).toBeGreaterThan(wide['section-tiles'] ?? 0)
  expect(narrow['section-expanded']).toBeUndefined()
  expect(sectionTopsOf({ columns: 102, header: head, repos: [], chips: null, hasError: false, body: 'summary', hasExpanded: false })).toEqual({ 'section-header': 0, 'section-summary': headerRowsOf(102, [], head) * LH + 12 })
})

test('chips wrap onto as many lines as the room needs', () => {
  const widths = chips.map(chipWidthOf)
  expect(linesOf(widths, 10_000, 6)).toBe(1)
  expect(linesOf(widths, Math.max(...widths), 6)).toBe(widths.length)
})

test('the scroll answer names the row the window landed on, and says when the content ended first', () => {
  expect(scrollMessage('section-tiles', 4, 2, 57)).toBe('Scrolled the pane to section-tiles: asked row 4, landed on row 2, the end of the content. The pane is 57 columns wide.')
  expect(scrollMessage('section-tiles', 4, 4, 57)).toBe('Scrolled the pane to section-tiles (row 4). The pane is 57 columns wide.')
  expect(scrollMessage('end', undefined, 2, 57)).toBe('Scrolled the pane to end: row 2. The pane is 57 columns wide.')
})

test('the header lift is one tree row per scroll row: the scroll cell is the tree row, so the pin lands exactly at any offset', () => {
  for (const offset of [0, 1, 9, 83, 400]) {
    expect(down(liftOf(offset))).toBe(offset * 2)
    expect(tall(liftOf(offset))).toBe(offset)
  }
})

test('content height is known only where every row has a fixed height: tile rows and the archived list', () => {
  const input = { columns: 102, header: head, repos: ['~/dotfiles', 'toolkit'], chips, hasError: false, body: 'tiles', hasExpanded: false } as const
  const body = (sectionTopsOf(input)['section-tiles'] ?? 0)
  expect(contentHeightOf(input, 2)).toBe(body + 2 * TILE_HEIGHT + 10 + 16)
  expect(contentHeightOf({ ...input, body: 'archived' }, 3)).toBe(body + 2 + 8 + 3 * 52 + 2 + 16)
  expect(contentHeightOf({ ...input, hasExpanded: true }, 2)).toBeUndefined()
  expect(contentHeightOf({ ...input, hasError: true }, 2)).toBeUndefined()
  expect(contentHeightOf({ ...input, body: 'summary', chips: null }, 2)).toBeUndefined()
  expect(contentHeightOf(input, 0)).toBeUndefined()
  expect(contentHeightOf({ ...input, columns: 30 }, 1)).toBeGreaterThanOrEqual((sectionTopsOf({ ...input, columns: 30 })['section-tiles'] ?? 0) + TILE_HEIGHT + 16)
})
