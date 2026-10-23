import { expect, test } from 'claude-code/testing'

import type { BoardSession, LiveSession, Repo } from '../../../types'

import type { Row } from '../../lib/rows'
import { UNKNOWN, lossesOf } from './losses'

const MAIN = '/w/repo'
const CLEAN = '/w/repo-clean'
const DIRTY = '/w/repo-dirty'

const tree = (path: string, extra: object = {}) => ({ path, branch: 'b', sha: 'abc1234', isMain: false, dirty: 0, paths: [], upstream: '', ahead: 0, behind: 0, unmerged: 0, ...extra })

const REPOS: Repo[] = [{ path: MAIN, name: 'repo', localOnly: 0, base: 'main', worktrees: [tree(MAIN, { isMain: true, branch: 'main' }), tree(CLEAN), tree(DIRTY, { dirty: 3, unmerged: 2 })] }]

const live = (cwd: string): LiveSession => ({ id: 's', name: 's', title: 's', cwd, isRunning: false, isArchived: false, lastActivityAt: 0 })

const board = (cwd: string) => ({ id: 's', name: 's', state: 'done', cwd }) as BoardSession

const rowOf = (liveCwd: string | undefined, boardCwd: string | undefined): Row => ({
  id: 's',
  name: 's',
  title: 's',
  state: 'done',
  ...(liveCwd === undefined ? {} : { live: live(liveCwd) }),
  ...(boardCwd === undefined ? {} : { board: board(boardCwd) }),
})

test('no live session fails closed even when the board cwd is a clean merged worktree', () => {
  expect(lossesOf(rowOf(undefined, CLEAN), REPOS, [])).toEqual([UNKNOWN])
})

test('an empty live cwd fails closed even when the board cwd is a clean merged worktree', () => {
  expect(lossesOf(rowOf('', CLEAN), REPOS, [])).toEqual([UNKNOWN])
})

test('no live cwd and no board cwd fails closed', () => {
  expect(lossesOf(rowOf(undefined, undefined), REPOS, [])).toEqual([UNKNOWN])
})

test('a clean merged live cwd reports no loss', () => {
  expect(lossesOf(rowOf(CLEAN, undefined), REPOS, [])).toEqual([])
})

test('a live cwd beats a different board cwd', () => {
  const losses = lossesOf(rowOf(DIRTY, CLEAN), REPOS, [])
  expect(losses).not.toEqual([])
  expect(losses.join(' ')).toContain('3 uncommitted')
})

test('a board cwd outside the known repos never reads as no loss', () => {
  expect(lossesOf(rowOf(CLEAN, '/elsewhere/tree'), REPOS, [])).toContain(UNKNOWN)
  expect(lossesOf(rowOf(undefined, '/elsewhere/tree'), REPOS, [])).toEqual([UNKNOWN])
})

test('a live cwd outside the known repos never reads as no loss', () => {
  expect(lossesOf(rowOf('/elsewhere/tree', CLEAN), REPOS, [])).toContain(UNKNOWN)
})
