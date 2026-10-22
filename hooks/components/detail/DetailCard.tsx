import type { RenderChildren } from 'claude-code'

import { across, down } from '../../lib/layout'
import { C } from '../../theme/tokens'
import type { TextUi } from '../types'

export type DetailCardProps = { id: string; isNeeds?: boolean; children: RenderChildren }

export function DetailCard(ui: TextUi, props: DetailCardProps) {
  const { Box } = ui
  return (
    <Box key={`detail-${props.id}`} flexDirection="column" gap={down(8)} paddingX={across(12)} paddingY={down(12)} borderStyle="round" borderColor={props.isNeeds ? C.red : C.border} backgroundColor={C.surface}>
      {props.children}
    </Box>
  )
}
