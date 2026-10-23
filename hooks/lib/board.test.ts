import { expect, test } from 'claude-code/testing'

import { CHAT_BOARD, GIT, HOME, TOOLKIT, WORKTREE, liveOf } from '../testing/world'
import { boardFromChat, boardFromJson, progressOf, stepOf } from './board'
import { dirtyOf, parseStatus, parseWorktrees } from './git'

test('the helpers read a chat board, steps and git porcelain', async () => {
  const board = boardFromChat(CHAT_BOARD)
  expect(board?.tick).toBe('19:20')
  expect(board?.sessions.map(one => [one.name, one.state])).toEqual([
    ['setup-ui-redo', 'working'],
    ['conductor-redo', 'done'],
  ])
  expect(board?.sessions[0]?.risk).toBe('bash 3.2 key handling unproven')
  expect(board?.sessions[1]?.sha).toBe('07ab1b7')
  expect(board?.needsYou).toEqual(['Approve the plan'])
  expect(stepOf('step 3 of 5 — build screens')).toEqual({ done: 3, total: 5, label: 'build screens' })
  const trees = parseWorktrees(GIT[`${WORKTREE} worktree`] as string)
  expect(trees.map(tree => [tree.isMain, tree.branch, tree.sha])).toEqual([
    [true, 'main', 'd575596'],
    [false, '', '0a4621c'],
  ])
  expect(parseStatus(GIT[`${TOOLKIT} status`] as string)).toEqual({ dirty: 0, paths: [], upstream: 'origin/main', ahead: 0, behind: 0 })
  const tree = { path: `${HOME}/dotfiles`, dirty: 3, paths: ['hooks.py', 'mods/master-session-status/hooks/register.tsx', 'mods/other/x.ts'] }
  expect(dirtyOf(tree, [], HOME)).toBe(3)
  expect(dirtyOf(tree, ['mods/master-session-status/'], HOME)).toBe(1)
  expect(dirtyOf(tree, ['~/dotfiles/mods/master-session-status'], HOME)).toBe(1)
  expect(dirtyOf(tree, ['skills/'], HOME)).toBe(0)
  expect(parseStatus('# branch.oid a\n1 .M N... 100644 100644 100644 a b my file.ts\n? new dir/x.sh\n').paths).toEqual(['my file.ts', 'new dir/x.sh'])
})

test('progress: segment fills in board order, archived left out', async () => {
  const session = (id: string, state: string, progress?: string) => ({ id, name: id, state, progress })
  const boardOf = (sessions: unknown[]) => ({ sessions, needsYou: [], repos: [], source: 'tool' as const }) as Parameters<typeof progressOf>[0]
  expect(progressOf(null, liveOf()).total).toBe(0)
  expect(progressOf(boardOf([]), liveOf()).total).toBe(0)
  expect(progressOf(boardOf([session('a', 'done'), session('b', 'done')]), liveOf()).segments.map(one => one.fill)).toEqual([1, 1])
  const mixed = progressOf(boardOf([session('a', 'done'), session('b', 'working', 'step 2 of 4 — build'), session('c', 'waiting')]), liveOf())
  expect(mixed.total).toBe(3)
  expect(mixed.segments.map(one => [one.id, one.fill])).toEqual([
    ['a', 1],
    ['b', 0.5],
    ['c', 0],
  ])
  const archived = progressOf(boardOf([session('a', 'done'), session('b', 'working', 'step 2 of 4'), session('c', 'waiting'), session('d', 'done')]), liveOf(['d']))
  expect([archived.segments.map(one => one.id), archived.total]).toEqual([['a', 'b', 'c'], 3])
})

test('a board read from JSON drops a row without an id or a valid state and keeps the good one', async () => {
  const good = { id: 'local_a', state: 'working' }
  for (const bad of [{ id: 'x' }, { state: 'working' }, { id: 'x', state: 'nope' }, 'text'])
    expect(boardFromJson({ sessions: [good, bad] }, 'file')?.sessions.map(one => one.id)).toEqual(['local_a'])
})
