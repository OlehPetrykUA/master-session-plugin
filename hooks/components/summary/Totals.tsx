import { across, down, tall } from '../../lib/layout'
import type { IconName } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import { Quiet } from '../Quiet'
import type { Ui } from '../types'

export type Total = { key: string; icon: IconName; label: string; value: string; note: string }

export type TotalsProps = { totals: readonly Total[] }

export function Totals(ui: Ui, props: TotalsProps) {
  const { Box, Text } = ui
  const total = ({ key, icon, label, value, note }: Total) => (
    <Box key={`total-${key}`} width="50%" flexShrink={1} minWidth={0} flexDirection="column" gap={down(4)} height={tall(92)} paddingX={across(12)} paddingY={down(12)} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
      <Box flexDirection="row" alignItems="center" gap={across(6)}>
        {Icon(ui, { id: `total-icon-${key}`, name: icon, size: 14, tone: 'muted' })}
        <Text size="footnote" color={C.muted}>
          {label}
        </Text>
      </Box>
      <Text weight="semibold" size="title" tabular>
        {value}
      </Text>
      {Quiet(ui, { text: note })}
    </Box>
  )
  return (
    <Box key="totals" flexDirection="column" gap={down(10)}>
      <Box flexDirection="row" gap={across(10)}>
        {props.totals.slice(0, 2).map(total)}
      </Box>
      <Box flexDirection="row" gap={across(10)}>
        {props.totals.slice(2).map(total)}
      </Box>
    </Box>
  )
}
