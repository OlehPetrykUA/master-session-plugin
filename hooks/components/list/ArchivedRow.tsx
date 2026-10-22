import type { LiveSession } from '../../../types'

import { across, down } from '../../lib/layout'
import { ageOf } from '../../lib/list'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Icon } from '../Icon'
import type { Actions, Ui } from '../types'
import { UnarchiveConfirm } from '../UnarchiveConfirm'

export type ArchivedRowProps = { one: LiveSession; at: number; asking: string; isReadOnly: boolean; actions: Actions }

export function ArchivedRow(ui: Ui, props: ArchivedRowProps) {
  const { Box, Text } = ui
  const { one, actions } = props
  const name = one.name || one.title
  const isAsking = props.asking === `unarchive:${one.id}`
  return (
    <Box key={`archived-${one.id}`} flexDirection="column" gap={down(8)} paddingTop={down(8)} paddingBottom={down(8)} paddingLeft={across(12)} paddingRight={across(8)} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
      <Box flexDirection="row" alignItems="center" gap={across(8)}>
        <Box flexDirection="column" gap={down(2)} flexGrow={1} flexShrink={1} minWidth={0}>
          <Text weight="bold" size="heading" wrap="truncate-end">
            {one.title || one.name}
          </Text>
          <Box flexDirection="row" alignItems="center" gap={across(4)}>
            {Icon(ui, { id: `archived-icon-${one.id}`, name: 'archive', size: 12, tone: 'muted' })}
            <Text size="footnote" color={C.muted}>
              {`archived ${ageOf(props.at - one.lastActivityAt)}`}
            </Text>
          </Box>
        </Box>
        {props.isReadOnly || isAsking ? null : ActionButton(ui, { id: `unarchive-${one.id}`, kind: 'ghost', icon: 'unarchive', label: 'Unarchive', onPress: () => actions.confirm(`unarchive:${one.id}`), size: 'b32', iconSize: 16 })}
        {isAsking ? null : ActionButton(ui, { id: `archived-open-${one.id}`, kind: 'secondary', icon: 'open', label: 'Open', onPress: () => actions.open(one.id, name), size: 'b32', iconSize: 16 })}
      </Box>
      {isAsking ? UnarchiveConfirm(ui, { one, actions }) : null}
    </Box>
  )
}
