import type { LiveSession, Repo } from '../../../types'

import { ARCHIVE_LIMIT } from '../../lib/constants'
import { locate } from '../../lib/git'
import { plural } from '../../lib/list'
import type { Row } from '../../lib/rows'

export const UNKNOWN = 'git state unknown'

const pathsOf = (row: Row) => [...new Set([row.live?.cwd ?? '', row.board?.cwd ?? ''])].filter(Boolean)

function lossesAt(path: string, trees: readonly Repo[]) {
  const found = locate(path, trees)
  const where = found?.tree
  if (!found || !where) return [UNKNOWN]
  if (where.isMain || (where.unmerged === 0 && !where.dirty)) return []
  return [
    where.dirty ? `${plural(where.dirty, 'uncommitted file')} in ${where.path.split('/').at(-1) ?? where.path}` : '',
    where.unmerged === undefined ? UNKNOWN : where.unmerged ? `${plural(where.unmerged, 'commit')} on ${where.branch || 'its branch'} that ${where.unmerged === 1 ? 'is' : 'are'} not on ${found.repo.base}` : '',
    'the worktree folder itself',
  ].filter(Boolean)
}

function lineAt(path: string, trees: readonly Repo[]) {
  const found = locate(path, trees)
  const where = found?.tree
  if (!found || !where) return UNKNOWN
  if (where.isMain) return ''
  if (where.unmerged === undefined) return UNKNOWN
  return where.unmerged ? `${plural(where.unmerged, 'commit')} not on ${found.repo.base}` : where.dirty ? `${where.dirty} uncommitted` : ''
}

const isWorktree = (path: string, trees: readonly Repo[]) => !locate(path, trees)?.tree.isMain

export function sideOf(row: Row, sessions: readonly LiveSession[], trees: readonly Repo[]) {
  const ids = new Set([row.id])
  const cwds = new Set(row.live?.cwd && isWorktree(row.live.cwd, trees) ? [row.live.cwd] : [])
  const found: LiveSession[] = []
  for (let grew = true; grew; ) {
    grew = false
    for (const one of sessions) {
      if (one.isArchived || ids.has(one.id) || !(ids.has(one.startedBy ?? '') || cwds.has(one.cwd))) continue
      ids.add(one.id)
      found.push(one)
      if (isWorktree(one.cwd, trees)) cwds.add(one.cwd)
      grew = true
    }
  }
  return found
}

const othersOf = (row: Row, sessions: readonly LiveSession[], trees: readonly Repo[]) => sideOf(row, sessions, trees).filter(one => !pathsOf(row).includes(one.cwd))

const nameOf = (one: LiveSession) => one.name || one.title || one.id

const isCut = (sessions: readonly LiveSession[]) => sessions.filter(one => !one.isArchived).length >= ARCHIVE_LIMIT

export function lossesOf(row: Row, trees: readonly Repo[], sessions: readonly LiveSession[]) {
  if (!row.live?.cwd || isCut(sessions)) return [UNKNOWN]
  const own = pathsOf(row).flatMap(path => lossesAt(path, trees))
  const side = othersOf(row, sessions, trees).flatMap(one => lossesAt(one.cwd, trees).map(loss => `${nameOf(one)}: ${loss}`))
  return [...new Set([...own, ...side])]
}

export function lossLineOf(row: Row, trees: readonly Repo[], sessions: readonly LiveSession[]) {
  if (!row.live?.cwd || isCut(sessions)) return UNKNOWN
  const own = pathsOf(row)
    .map(path => lineAt(path, trees))
    .find(Boolean)
  if (own) return own
  const side = othersOf(row, sessions, trees)
    .map(one => ({ one, line: lineAt(one.cwd, trees) }))
    .find(each => each.line)
  return side ? `${nameOf(side.one)}: ${side.line}` : ''
}

export function mergedLineOf(row: Row, trees: readonly Repo[]) {
  const found = row.live?.cwd ? locate(row.live.cwd, trees) : undefined
  return found && !found.tree.isMain && found.tree.unmerged === 0 && !found.tree.dirty ? `merged to ${found.repo.base}` : ''
}
