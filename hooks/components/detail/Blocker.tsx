import { across, down, tall } from '../../lib/layout'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Icon } from '../Icon'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Ui } from '../types'

export type BlockerProps = { id: string; needsYou: string; canChat: boolean; onChat: () => void }

export function Blocker(ui: Ui, props: BlockerProps) {
  const { Box, Text } = ui
  return (
    <Box key={`blocker-${props.id}`} flexDirection="row" alignItems="center" gap={across(10)} minHeight={tall(68)} paddingLeft={across(12)} paddingRight={across(10)} paddingY={down(10)} borderStyle="round" borderColor={C.clear} backgroundColor={C.redTint}>
      {Icon(ui, { id: `blocker-icon-${props.id}`, name: 'blocker', size: 20, tone: 'red', weight: 1.75 })}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Text size="caption" weight="semibold" color={C.red}>
          BLOCKER
        </Text>
        {Strong(ui, { text: props.needsYou, isFull: true })}
        {Quiet(ui, { text: 'waiting for your answer', isFull: true })}
      </Box>
      {props.canChat ? ActionButton(ui, { id: `chat-${props.id}`, kind: 'primary', icon: 'chat', label: 'Open chat', onPress: props.onChat, size: 'l' }) : null}
    </Box>
  )
}
