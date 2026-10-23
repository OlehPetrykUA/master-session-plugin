import { expect, test } from 'claude-code/testing'

import type { PaneData } from '../components/types'
import { compactOf } from './format'
import { headerButtonsOf, statusOf } from './view'

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
