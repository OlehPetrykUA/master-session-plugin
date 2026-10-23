import { expect, test } from 'claude-code/testing'

import type { PaneData } from '../components/types'
import { headerButtonsOf } from './view'

const dataOf = (rows: number) => ({ rows: Array.from({ length: rows }, () => ({})), asked: null, columns: 60, isRefreshing: false }) as unknown as PaneData

test('Ask for updates shows only when worker sessions exist: subagents report on their own', () => {
  const ids = (rows: number) => headerButtonsOf(dataOf(rows), () => undefined, () => undefined).map(one => one.id)
  expect(ids(0)).toEqual(['refresh'])
  expect(ids(2)).toEqual(['ask', 'refresh'])
})
