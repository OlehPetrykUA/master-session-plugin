import type { Repo } from '../../types'

import { stepOf } from '../lib/board'
import { dirtyOf } from '../lib/git'
import { PAD, TILE_HEIGHT, across, down, tall } from '../lib/layout'
import { elapsedOf, lineOf, titleOf, whereOf } from '../lib/rows'
import type { Row } from '../lib/rows'
import { badge, gitBadge, ring } from '../theme/icons'
import { C, LABEL } from '../theme/tokens'
import { Hit } from './Hit'
import { Icon } from './Icon'
import type { Ui } from './types'

export type TileProps = { row: Row; trees: readonly Repo[]; home: string; at: number; textWidth: number; onToggle: () => void }

export function Tile(ui: Ui, props: TileProps) {
  const { Box, Text, Button, Svg } = ui
  const { row } = props
  const step = stepOf(row.board?.progress)
  const where = whereOf(row, props.trees)?.tree
  const elapsed = elapsedOf(row, props.at)
  const dirty = where ? dirtyOf(where, row.board?.files ?? [], props.home) : 0
  const isNeeds = row.state === 'needs-you'
  const git = dirty ? gitBadge(dirty) : undefined
  const note = isNeeds ? undefined : row.board?.note
  return (
    <Box
      key={`tile-${row.id}`}
      width="50%"
      flexShrink={1}
      minWidth={0}
      flexDirection="column"
      height={tall(TILE_HEIGHT)}
      paddingX={across(12)}
      paddingY={down(12)}
      borderStyle="round"
      borderColor={isNeeds ? C.red : C.border}
      backgroundColor={C.surface}
      hover={{ backgroundColor: C.tileHover, borderColor: isNeeds ? C.red : C.accentRing }}
    >
      <Box flexDirection="row" alignItems="center" gap={across(6)}>
        <Svg key={`tile-badge-${row.id}`} source={badge(row.state)} alt={LABEL[row.state]} width={32} height={32} />
        <Box flexGrow={1} />
        {elapsed ? (
          <Box flexDirection="row" alignItems="center" gap={across(3)}>
            {Icon(ui, { id: `tile-clock-${row.id}`, name: 'clock', size: 12, tone: 'muted', weight: 2.2 })}
            <Text size="footnote" color={C.muted} tabular>
              {elapsed}
            </Text>
          </Box>
        ) : null}
        <Svg key={`tile-ring-${row.id}`} source={ring(step?.done ?? 0, step?.total ?? 0, row.state)} alt={step ? `step ${step.done} of ${step.total}` : 'no steps yet'} width={34} height={34} />
      </Box>
      <Box flexDirection="row" marginTop={down(8)} minWidth={0} marginLeft={ui.Client ? 0 : across(-PAD)}>
        {ui.Client ? (
          <Text weight="semibold" size="heading" wrap="truncate-end">
            {titleOf(row)}
          </Text>
        ) : (
          <Button key={`tile-open-${row.id}`} plain label={titleOf(row)} onPress={props.onToggle} hover={{ backgroundColor: C.clear }} />
        )}
      </Box>
      <Box flexGrow={1} />
      <Box flexDirection="row" alignItems="center" gap={across(6)} height={tall(20)}>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text size="footnote" color={isNeeds ? C.red : row.board?.isQuiet ? C.amber : C.muted} weight={isNeeds ? 'semibold' : undefined} wrap="truncate-end">
            {note ?? lineOf(row)}
          </Text>
        </Box>
        {git ? <Svg key={`tile-git-${row.id}`} source={git.source} alt={`${dirty} uncommitted`} width={git.width} height={20} /> : null}
        {Icon(ui, { id: `tile-place-${row.id}`, name: where?.isMain === false ? 'branch' : 'house', size: 16, tone: 'faint', weight: 1.75 })}
      </Box>
      {Hit(ui, { id: `tile-${row.id}`, width: props.textWidth + 26, height: TILE_HEIGHT, onPress: props.onToggle })}
    </Box>
  )
}
