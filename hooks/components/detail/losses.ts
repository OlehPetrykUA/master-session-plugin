import type { Repo } from '../../../types'

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

export function lossesOf(row: Row, trees: readonly Repo[]) {
  if (!row.live?.cwd) return [UNKNOWN]
  return [...new Set(pathsOf(row).flatMap(path => lossesAt(path, trees)))]
}

export function lossLineOf(row: Row, trees: readonly Repo[]) {
  if (!row.live?.cwd) return UNKNOWN
  return pathsOf(row)
    .map(path => lineAt(path, trees))
    .find(Boolean) ?? ''
}

export function mergedLineOf(row: Row, trees: readonly Repo[]) {
  const found = row.live?.cwd ? locate(row.live.cwd, trees) : undefined
  return found && !found.tree.isMain && found.tree.unmerged === 0 && !found.tree.dirty ? `merged to ${found.repo.base}` : ''
}
