import type { RenderChildren } from 'claude-code'

import { across, down } from '../../lib/layout'
import type { IconName } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import type { Ui } from '../types'

export type BlockProps = { id: string; icon: IconName; label: string; children: RenderChildren; isHalf?: boolean; gap?: number }

export function Block(ui: Ui, props: BlockProps) {
  const { Box, Text } = ui
  return (
    <Box key={props.id} flexDirection="column" gap={down(props.gap ?? 4)} width={props.isHalf ? '50%' : '100%'} flexShrink={1} minWidth={0} paddingX={across(12)} paddingY={down(10)} borderStyle="round" borderColor={C.clear} backgroundColor={C.inset}>
      <Box flexDirection="row" alignItems="center" gap={across(6)}>
        {Icon(ui, { id: `${props.id}-icon`, name: props.icon, size: 14, tone: 'muted' })}
        <Text size="footnote" color={C.muted}>
          {props.label}
        </Text>
      </Box>
      {props.children}
    </Box>
  )
}
