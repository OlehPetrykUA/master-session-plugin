import { across, down } from '../../lib/layout'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Icon } from '../Icon'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Ui } from '../types'

export type BlockerProps = { id: string; label: string; lines: readonly { text: string; isStrong: boolean }[]; chat?: { width: number; onPress: () => void } }

export function Blocker(ui: Ui, props: BlockerProps) {
  const { Box, Text } = ui
  return (
    <Box key={`blocker-${props.id}`} flexDirection="column" gap={down(8)} paddingX={across(11)} paddingY={down(11)} borderStyle="round" borderColor={C.clear} backgroundColor={C.redTint}>
      <Box flexDirection="row" alignItems="flex-start" gap={across(12)}>
        {Icon(ui, { id: `blocker-icon-${props.id}`, name: 'blocker', size: 20, tone: 'red', weight: 1.75 })}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gap={down(2)}>
          <Text size="caption" weight="semibold" color={C.red}>
            {props.label.toUpperCase()}
          </Text>
          {props.lines.map(line => (line.isStrong ? Strong(ui, { text: line.text, isFull: true }) : Quiet(ui, { text: line.text, isFull: true })))}
        </Box>
      </Box>
      {props.chat ? ActionButton(ui, { id: `chat-${props.id}`, kind: 'primary', icon: 'chat', label: 'Open chat', size: 'b40', iconSize: 16, wide: props.chat.width, onPress: props.chat.onPress }) : null}
    </Box>
  )
}
