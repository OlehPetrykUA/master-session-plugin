import type { RenderChildren } from 'claude-code'

import { across, down } from '../../lib/layout'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import type { Glyph } from '../Icon'
import type { Ui } from '../types'

export type BlockProps = { id: string; icon: Glyph; label: string; children: RenderChildren; isHalf?: boolean; gap?: number }

export function Block(ui: Ui, props: BlockProps) {
  const { Box, Text } = ui
  return (
    <Box key={props.id} flexDirection="column" gap={down(props.gap ?? 4)} width={props.isHalf ? '50%' : '100%'} flexShrink={1} minWidth={0} paddingX={across(11)} paddingY={down(7)} borderStyle="round" borderColor={C.clear} backgroundColor={C.inset}>
      <Box flexDirection="row" alignItems="center" gap={across(8)}>
        {Icon(ui, { id: `${props.id}-icon`, name: props.icon, size: 14, tone: 'muted' })}
        <Text size="footnote" color={C.muted}>
          {props.label}
        </Text>
      </Box>
      {props.children}
    </Box>
  )
}
