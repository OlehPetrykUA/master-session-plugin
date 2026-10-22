import { across, down, tall } from '../../lib/layout'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import type { Ui } from '../types'
import { Block } from './Block'

export type TestsProps = { id: string; tests: readonly string[] }

export function Tests(ui: Ui, props: TestsProps) {
  const { Box, Text } = ui
  const { id } = props
  return Block(ui, {
    id: `tests-${id}`,
    icon: 'tests',
    label: 'Tests',
    children: (
      <Box key={`tests-pills-${id}`} flexDirection="row" flexWrap="wrap" columnGap={across(6)} rowGap={down(6)}>
        {props.tests.map((test, index) => (
          <Box key={`test-${id}-${index}`} flexDirection="row" alignItems="center" gap={across(5)} minHeight={tall(26)} paddingLeft={across(7)} paddingRight={across(9)} paddingY={0} borderStyle="round" borderColor={C.clear} backgroundColor={C.greenTint}>
            {Icon(ui, { id: `test-icon-${id}-${index}`, name: 'check', size: 12, tone: 'green', weight: 2.6 })}
            <Text size="footnote" weight="semibold" color={C.green}>
              {test}
            </Text>
          </Box>
        ))}
      </Box>
    ),
    gap: 8,
  })
}
