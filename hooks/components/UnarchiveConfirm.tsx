import type { LiveSession } from '../../types'

import { across, down } from '../lib/layout'
import { C } from '../theme/tokens'
import { ActionButton } from './ActionButton'
import { Quiet } from './Quiet'
import { Strong } from './Strong'
import type { Actions, TextUi, Ui } from './types'

export type UnarchiveConfirmProps = { one: LiveSession; actions: Actions }

export function UnarchiveConfirm(ui: TextUi | Ui, props: UnarchiveConfirmProps) {
  const { Box, Text, Button } = ui
  const { one, actions } = props
  const unarchive = () => actions.unarchive(one)
  const keep = () => actions.confirm('')
  if ('Svg' in ui)
    return (
      <Box key={`unarchive-ask-${one.id}`} flexDirection="column" gap={down(8)} paddingX={across(12)} paddingY={down(12)} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
        {Strong(ui, { text: `Unarchive ${one.name || one.title}?`, isFull: true })}
        {Quiet(ui, { text: 'It returns to the session list with its conversation.', isFull: true })}
        <Box flexDirection="row" gap={across(8)}>
          {ActionButton(ui, { id: `unarchive-yes-${one.id}`, kind: 'primary', icon: 'unarchive', label: 'Unarchive', onPress: unarchive, size: 'm' })}
          {ActionButton(ui, { id: `unarchive-no-${one.id}`, kind: 'secondary', icon: 'archive', label: 'Keep archived', onPress: keep, size: 'm' })}
        </Box>
      </Box>
    )
  return (
    <Box key={`unarchive-ask-${one.id}`} flexDirection="column" gap="xs">
      <Text size="footnote">Unarchive {one.name || one.title}? It returns to the session list with its conversation.</Text>
      <Box flexDirection="row" gap="sm">
        <Button key={`unarchive-yes-${one.id}`} label="Unarchive" variant="primary" onPress={unarchive} />
        <Button key={`unarchive-no-${one.id}`} label="Keep archived" onPress={keep} />
      </Box>
    </Box>
  )
}
