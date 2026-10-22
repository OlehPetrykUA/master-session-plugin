import { across } from '../../lib/layout'
import { ActionButton } from '../ActionButton'
import type { Ui } from '../types'

export type DetailActionsProps = { id: string; canOpen: boolean; canArchive: boolean; half: number; innerWidth: number; onOpen: () => void; onArchive: () => void }

export function DetailActions(ui: Ui, props: DetailActionsProps) {
  const { Box } = ui
  const { id, canOpen, canArchive, half } = props
  return (
    <Box key={`actions-${id}`} flexDirection="row" gap={across(8)}>
      {canOpen ? (
        <Box flexDirection="row" width={canArchive ? '50%' : '100%'} flexShrink={1} minWidth={0}>
          {ActionButton(ui, { id: `open-${id}`, kind: 'secondary', icon: 'open', label: 'Open', onPress: props.onOpen, size: 'xl', wide: canArchive ? half : props.innerWidth })}
        </Box>
      ) : null}
      {canArchive ? (
        <Box flexDirection="row" width={canOpen ? '50%' : '100%'} flexShrink={1} minWidth={0}>
          {ActionButton(ui, { id: `archive-${id}`, kind: 'secondary', icon: 'archive', label: 'Archive…', onPress: props.onArchive, size: 'xl', wide: canOpen ? half : props.innerWidth })}
        </Box>
      ) : null}
    </Box>
  )
}
