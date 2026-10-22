import type { RowItem } from '../lib/list'
import { shortNameOf } from '../lib/list'
import { UNARCHIVE_TEXT } from './detail/ArchivedDetail'
import type { Actions, TextUi } from './types'

export type UnarchiveConfirmProps = { item: Extract<RowItem, { kind: 'archived' }>; actions: Actions }

export function UnarchiveConfirm(ui: TextUi, props: UnarchiveConfirmProps) {
  const { Box, Text, Button } = ui
  const { item, actions } = props
  const { one } = item
  return (
    <Box key={`unarchive-ask-${one.id}`} flexDirection="column" gap="xs">
      <Text size="footnote">{`Unarchive ${shortNameOf(item)}? ${UNARCHIVE_TEXT}`}</Text>
      <Box flexDirection="row" gap="sm">
        <Button key={`unarchive-no-${one.id}`} label="Cancel" onPress={() => actions.confirm('')} />
        <Button key={`unarchive-yes-${one.id}`} label="Unarchive" variant="primary" onPress={() => actions.unarchive(one)} />
      </Box>
    </Box>
  )
}
