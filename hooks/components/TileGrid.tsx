import type { Repo } from '../../types'

import { across, down } from '../lib/layout'
import type { Row } from '../lib/rows'
import { C } from '../theme/tokens'
import { ExpandedTile } from './ExpandedTile'
import { Tile } from './Tile'
import type { Actions, Ui } from './types'

export type TileGridProps = {
  shown: readonly Row[]
  focused: readonly Row[]
  isEmpty: boolean
  trees: readonly Repo[]
  home: string
  at: number
  asking: string
  isReadOnly: boolean
  textWidth: number
  innerWidth: number
  actions: Actions
}

export function TileGrid(ui: Ui, props: TileGridProps) {
  const { Box, Text } = ui
  const rest = props.shown.filter(row => !props.focused.includes(row))
  const pairs: Row[][] = []
  for (let index = 0; index < rest.length; index += 2) pairs.push(rest.slice(index, index + 2))
  const tile = (row: Row) => Tile(ui, { row, trees: props.trees, home: props.home, at: props.at, textWidth: props.textWidth, onToggle: () => props.actions.toggle(row.id) })
  return (
    <Box key="section-tiles" flexDirection="column" gap={down(10)}>
      {props.focused.length ? (
        <Box key="section-expanded" flexDirection="column" gap={down(10)}>
          {props.focused.map(row => ExpandedTile(ui, { row, trees: props.trees, home: props.home, at: props.at, asking: props.asking, isReadOnly: props.isReadOnly, innerWidth: props.innerWidth, actions: props.actions }))}
        </Box>
      ) : null}
      {pairs.map((two, index) => (
        <Box key={`row-${two[0]?.id ?? index}`} flexDirection="row" gap={across(10)}>
          {two.map(tile)}
          {two.length === 1 ? <Box key="pad" width="50%" flexShrink={1} /> : null}
        </Box>
      ))}
      {props.shown.length ? null : (
        <Text key="empty" size="footnote" color={C.muted}>
          {props.isEmpty ? 'No worker sessions yet. Start one with /master-session:start and a task.' : 'No sessions in this filter.'}
        </Text>
      )}
    </Box>
  )
}
