import { isArchivable } from '../../data/contract'
import { stepOf } from '../../lib/board'
import { across, down, tall } from '../../lib/layout'
import { elapsedOf, titleOf } from '../../lib/rows'
import type { Row } from '../../lib/rows'
import { square } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { ArchiveConfirm } from '../ArchiveConfirm'
import { Card } from '../Card'
import { ListRow } from '../ListRow'
import { Quiet } from '../Quiet'
import type { Actions, Ui } from '../types'

export type FinishedListProps = { finished: readonly Row[]; idle: readonly Row[]; target: Row | undefined; at: number; asking: string; isReadOnly: boolean; actions: Actions }

export function FinishedList(ui: Ui, props: FinishedListProps) {
  const { Box, Text, Svg } = ui
  const { finished, idle, target, at, asking, actions } = props
  return (
    <Box key="summary-finished" flexDirection="column" gap={down(8)}>
      <Box flexDirection="row" alignItems="center" gap={across(6)} height={tall(32)}>
        <Text weight="semibold">Finished</Text>
        <Text color={C.muted}>{String(finished.length)}</Text>
        <Box flexGrow={1} />
        {idle.length > 1 && asking !== 'archive:all' && !props.isReadOnly ? ActionButton(ui, { id: 'archive-all', kind: 'ghost', icon: 'archive', label: 'Archive all', onPress: () => actions.confirm('archive:all') }) : null}
      </Box>
      {asking === 'archive:all' ? ArchiveConfirm(ui, { id: 'all', title: `Archive all ${idle.length} finished sessions?`, targets: idle, actions }) : null}
      {Card(ui, {
        id: 'finished-list',
        children: finished.map((row, index) => {
          const step = stepOf(row.board?.progress)
          const canArchive = isArchivable(row.board ?? { state: row.state }, row.live) && !props.isReadOnly && asking !== `archive:${row.id}`
          return ListRow(ui, {
            id: `finished-${row.id}`,
            mark: <Svg key={`finished-icon-${row.id}`} source={square('check', 'grey', 'greyTint', 28, 9, 15)} alt="done" width={28} height={28} />,
            name: titleOf(row),
            meta: Quiet(ui, { text: [step ? `${step.done}/${step.total}` : '', elapsedOf(row, at)].filter(Boolean).join(' · ') }),
            actions: canArchive ? ActionButton(ui, { id: `archive-${row.id}`, kind: 'soft', icon: 'archive', label: 'Archive', onPress: () => actions.confirm(`archive:${row.id}`), size: 'ma' }) : null,
            isFirst: index === 0,
          })
        }),
      })}
      {target ? ArchiveConfirm(ui, { id: target.id, title: `Archive ${target.name}?`, targets: [target], actions }) : null}
    </Box>
  )
}
