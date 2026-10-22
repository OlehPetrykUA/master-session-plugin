import type { Board, BoardSession, Live, LiveSession, Repo, SessionState, Worktree } from '../../types'

import { ORDER, stepOf } from './board'
import { compactOf } from './format'
import { expandHome, isRepoClean, locate } from './git'

export type Row = {
  id: string
  name: string
  title: string
  state: SessionState
  board?: BoardSession
  live?: LiveSession
}

export type Counts = Record<SessionState, number> & { dirty: number; clean: number }

export function rowsOf(board: Board | null, live: Live): Row[] {
  const onBoard = new Set(board?.sessions.map(one => one.id))
  const gone = new Set(live.sessions.filter(one => one.isArchived).map(one => one.id))
  const current = live.sessions.filter(one => !one.isArchived)
  const isWorker = (one: LiveSession) => one.startedBy === live.self || onBoard.has(one.id)
  const pool = board || current.some(isWorker) ? current.filter(isWorker) : current
  const rows = new Map<string, Row>()
  for (const one of board?.sessions ?? []) {
    if (!gone.has(one.id)) rows.set(one.id, { id: one.id, name: one.name, title: one.title ?? '', state: one.state, board: one })
  }
  for (const one of pool) {
    const known = rows.get(one.id)
    rows.set(one.id, {
      id: one.id,
      name: known?.name ?? (one.name || one.title),
      title: known?.title || one.title,
      state: known?.state ?? (one.isRunning ? 'working' : 'waiting'),
      board: known?.board,
      live: one,
    })
  }
  return [...rows.values()].sort((left, right) => ORDER.indexOf(left.state) - ORDER.indexOf(right.state))
}

export function countsOf(rows: readonly Row[], repos: readonly Repo[]): Counts {
  const counts: Counts = { 'needs-you': 0, waiting: 0, working: 0, done: 0, dirty: 0, clean: 0 }
  for (const row of rows) counts[row.state] += 1
  for (const repo of repos) counts[isRepoClean(repo) ? 'clean' : 'dirty'] += 1
  return counts
}

export const archivedOf = (live: Live) => live.sessions.filter(one => one.isArchived)

export const lineOf = (row: Row) => {
  if (row.state === 'needs-you') return 'needs you'
  if (row.state === 'done') return 'done'
  return stepOf(row.board?.progress)?.label || row.board?.now || (row.live?.isRunning ? 'running' : 'idle')
}

export const activityOf = (row: Row) =>
  (row.board?.activity ?? []).slice(0, 3).map(line => {
    const cut = line.lastIndexOf(' · ')
    return { text: cut > 0 ? line.slice(0, cut) : line, ago: cut > 0 ? line.slice(cut + 3) : '', isGood: /\bok\b|pass|✓/i.test(line) }
  })

export const whereOf = (row: Row, trees: readonly Repo[]) => {
  const cwd = row.board?.cwd ?? row.live?.cwd
  return cwd ? locate(cwd, trees) : undefined
}

export const elapsedOf = (row: Row, at: number) => (row.live?.createdAt !== undefined ? compactOf(at - row.live.createdAt) : (row.board?.time ?? ''))

export const titleOf = (row: Row) => row.live?.title || row.title || row.name

export const headOf = (tree: Worktree) => (tree.branch ? `branch ${tree.branch}` : `detached ＠${tree.sha}`)

export const syncOf = (tree: Worktree) => (tree.upstream ? `ahead ${tree.ahead} · behind ${tree.behind}` : 'no upstream')

export const othersOf = (row: Row, where: Worktree | undefined, trees: readonly Repo[], home: string) =>
  (row.board?.worktrees ?? []).map(path => locate(expandHome(path, home), trees)?.tree).filter((tree): tree is Worktree => !!tree && tree.path !== where?.path)
