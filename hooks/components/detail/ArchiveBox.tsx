import { across, down, faceWidth, tall } from '../../lib/layout'
import { dot } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Ui } from '../types'

export type ArchiveBoxProps = { id: string; name: string; losses: readonly string[]; width: number; onCancel: () => void; onArchive: () => void }

export const LOST = 'Archiving stops the session and removes its worktree. This would be lost:'

export function ArchiveBox(ui: Ui, props: ArchiveBoxProps) {
  const { Box, Text, Svg } = ui
  const { id } = props
  const cancel = faceWidth('Cancel', 'b40') + 1
  return (
    <Box key={`confirm-${id}`} flexDirection="column" gap={down(8)} paddingX={across(11)} paddingY={down(11)} borderStyle="round" borderColor={C.clear} backgroundColor={C.inset}>
      {Strong(ui, { text: `Archive ${props.name}?`, isFull: true })}
      {Quiet(ui, { text: LOST, isFull: true })}
      <Box key={`losses-${id}`} flexDirection="column" gap={down(4)}>
        {props.losses.map((loss, index) => (
          <Box key={`loss-${id}-${index}`} flexDirection="row" alignItems="flex-start" gap={across(8)}>
            <Box flexDirection="row" alignItems="center" height={tall(16)}>
              <Svg key={`loss-dot-${id}-${index}`} source={dot('red', 6)} alt="lost" width={6} height={6} />
            </Box>
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text size="footnote" wrap="wrap">
                {loss}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
      <Box key={`confirm-buttons-${id}`} flexDirection="row" gap={across(8)} marginTop={down(4)}>
        {ActionButton(ui, { id: `archive-no-${id}`, kind: 'secondary', icon: 'fail', label: 'Cancel', size: 'b40', iconSize: 16, onPress: props.onCancel })}
        <Box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0}>
          {ActionButton(ui, { id: `archive-yes-${id}`, kind: 'primary', icon: 'archive', label: 'Archive and remove', size: 'b40', iconSize: 16, wide: props.width - 24 - cancel - 8, onPress: props.onArchive })}
        </Box>
      </Box>
    </Box>
  )
}
