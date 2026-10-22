import { across, down, tall } from '../../lib/layout'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Icon } from '../Icon'
import type { Ui } from '../types'

export type UndoBarProps = { id: string; name?: string; text: string; onUndo?: () => void }

export function UndoBar(ui: Ui, props: UndoBarProps) {
  const { Box, Text } = ui
  const { id } = props
  return (
    <Box key={`undo-bar-${id}`} flexDirection="row" alignItems="center" gap={across(8)} minHeight={tall(40)} paddingTop={down(3)} paddingBottom={down(3)} paddingLeft={across(11)} paddingRight={across(3)} borderStyle="round" borderColor={C.clear} backgroundColor={C.inset}>
      {Icon(ui, { id: `undo-icon-${id}`, name: 'archive', size: 14, tone: 'muted' })}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="wrap">
          {props.name ? <Text weight="bold">{props.name}</Text> : null}
          {props.name ? ` ${props.text}` : props.text}
        </Text>
      </Box>
      {props.onUndo ? ActionButton(ui, { id: `undo-${id}`, kind: 'ghost', icon: 'undo', label: 'Undo', size: 'b32', iconSize: 16, onPress: props.onUndo }) : null}
    </Box>
  )
}
