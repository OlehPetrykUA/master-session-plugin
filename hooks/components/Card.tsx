import type { RenderChildren } from 'claude-code'

import { across, down } from '../lib/layout'
import { C } from '../theme/tokens'
import type { TextUi } from './types'

export type CardProps = { id: string; children: RenderChildren }

export function Card(ui: TextUi, props: CardProps) {
  const { Box } = ui
  return (
    <Box key={props.id} flexDirection="column" paddingX={across(4)} paddingY={down(4)} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
      {props.children}
    </Box>
  )
}
