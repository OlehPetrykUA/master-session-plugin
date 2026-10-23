import type { RenderChildren } from 'claude-code'

import { across, down, tall } from '../../lib/layout'
import { C } from '../../theme/tokens'
import type { Ui } from '../types'
import { Row } from './Row'
import type { RowProps } from './Row'

export type CardProps = RowProps & { children: RenderChildren }

export function Card(ui: Ui, props: CardProps) {
  const { Box } = ui
  const { item } = props
  return (
    <Box key={`detail-${item.id}`} flexDirection="column" paddingX={0} paddingY={0} borderStyle="round" borderColor={item.status === 'needs' ? C.red : C.border} backgroundColor={C.surface}>
      {Row(ui, { ...props, isInCard: true })}
      <Box key={`rule-${item.id}`} height={tall(1)} marginLeft={across(12)} marginRight={across(12)} backgroundColor={C.border} />
      <Box key={`body-${item.id}`} flexDirection="column" gap={down(8)} paddingX={across(12)} paddingY={down(12)}>
        {props.children}
      </Box>
    </Box>
  )
}
