import type { RenderChildren } from 'claude-code'

import { across } from '../../lib/layout'
import type { TextUi } from '../types'

export type PairProps = { id: string; left: RenderChildren; right: RenderChildren }

export function Pair(ui: TextUi, props: PairProps) {
  const { Box } = ui
  return (
    <Box key={props.id} flexDirection="row" alignItems="stretch" gap={across(8)}>
      {props.left}
      {props.right}
    </Box>
  )
}
