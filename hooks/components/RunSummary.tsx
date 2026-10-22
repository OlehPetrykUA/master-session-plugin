import type { Board, Repo } from '../../types'

import { isArchivable } from '../data/contract'
import { spanOf } from '../lib/format'
import { down } from '../lib/layout'
import type { Counts, Row } from '../lib/rows'
import { FinishedList } from './summary/FinishedList'
import { NeedsYouList } from './summary/NeedsYouList'
import { Totals } from './summary/Totals'
import type { Total } from './summary/Totals'
import type { Actions, Ui } from './types'

export type RunSummaryProps = { rows: readonly Row[]; counts: Counts; trees: readonly Repo[]; board: Board | null; at: number; asking: string; isReadOnly: boolean; actions: Actions }

export function RunSummary(ui: Ui, props: RunSummaryProps) {
  const { Box } = ui
  const { rows, counts, trees, board, at, asking, actions } = props
  const needs = rows.filter(row => row.state === 'needs-you')
  const finished = rows.filter(row => row.state === 'done')
  const idle = finished.filter(row => isArchivable(row.board ?? { state: row.state }, row.live))
  const commits = rows.reduce((sum, row) => sum + (row.board?.commits?.length ?? 0), 0)
  const first = Math.min(...rows.flatMap(row => (row.live?.createdAt !== undefined ? [row.live.createdAt] : [])), board?.since ?? at)
  const totals: Total[] = [
    { key: 'sessions', icon: 'all', label: 'Sessions', value: String(rows.length), note: `${counts.done} done · ${counts['needs-you']} needs you` },
    { key: 'commits', icon: 'git', label: 'Commits', value: commits ? String(commits) : '—', note: `across ${trees.length} repo${trees.length === 1 ? '' : 's'}` },
    { key: 'tests', icon: 'check', label: 'Tests passed', value: board?.testsPassed !== undefined ? String(board.testsPassed) : '—', note: board?.testsNote ?? '' },
    { key: 'duration', icon: 'clock', label: 'Duration', value: spanOf(at - first), note: board?.tick ? `finished ${board.tick}` : '' },
  ]
  const target = rows.find(row => asking === `archive:${row.id}`)
  return (
    <Box key="section-summary" flexDirection="column" gap={down(16)}>
      {Totals(ui, { totals })}
      {needs.length ? NeedsYouList(ui, { needs, actions }) : null}
      {FinishedList(ui, { finished, idle, target, at, asking, isReadOnly: props.isReadOnly, actions })}
    </Box>
  )
}
