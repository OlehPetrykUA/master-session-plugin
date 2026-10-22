import type { Repo } from '../../../types'

import { plural } from '../../lib/list'
import { whereOf } from '../../lib/rows'
import type { Row } from '../../lib/rows'

export function lossesOf(row: Row, trees: readonly Repo[]) {
  const where = whereOf(row, trees)?.tree
  if (!where || where.isMain || (!where.dirty && !where.unmerged)) return []
  return [
    where.dirty ? `${plural(where.dirty, 'uncommitted file')} in ${where.path.split('/').at(-1) ?? where.path}` : '',
    where.unmerged ? `${plural(where.unmerged, 'commit')} on ${where.branch || 'its branch'} that ${where.unmerged === 1 ? 'is' : 'are'} not on main` : '',
    'the worktree folder itself',
  ].filter(Boolean)
}

export function lossLineOf(row: Row, trees: readonly Repo[]) {
  const where = whereOf(row, trees)?.tree
  if (!where || where.isMain) return ''
  return where.unmerged ? `${plural(where.unmerged, 'commit')} not on main` : where.dirty ? `${where.dirty} uncommitted` : ''
}
