import type { Repo } from '../../../types'

import { plural } from '../../lib/list'
import { whereOf } from '../../lib/rows'
import type { Row } from '../../lib/rows'

export const UNKNOWN = 'git state unknown'

export function lossesOf(row: Row, trees: readonly Repo[]) {
  const found = whereOf(row, trees)
  const where = found?.tree
  if (!found || !where) return [UNKNOWN]
  if (where.isMain || (where.unmerged === 0 && !where.dirty)) return []
  return [
    where.dirty ? `${plural(where.dirty, 'uncommitted file')} in ${where.path.split('/').at(-1) ?? where.path}` : '',
    where.unmerged === undefined ? UNKNOWN : where.unmerged ? `${plural(where.unmerged, 'commit')} on ${where.branch || 'its branch'} that ${where.unmerged === 1 ? 'is' : 'are'} not on ${found.repo.base}` : '',
    'the worktree folder itself',
  ].filter(Boolean)
}

export function lossLineOf(row: Row, trees: readonly Repo[]) {
  const found = whereOf(row, trees)
  const where = found?.tree
  if (!found || !where) return UNKNOWN
  if (where.isMain) return ''
  if (where.unmerged === undefined) return UNKNOWN
  return where.unmerged ? `${plural(where.unmerged, 'commit')} not on ${found.repo.base}` : where.dirty ? `${where.dirty} uncommitted` : ''
}
