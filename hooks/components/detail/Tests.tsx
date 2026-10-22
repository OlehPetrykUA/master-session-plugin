import { across, down, tall } from '../../lib/layout'
import { oneLine } from '../../lib/list'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import { Quiet } from '../Quiet'
import type { Ui } from '../types'
import { Block } from './Block'

export type TestsProps = { id: string; tests: readonly string[] }

export const TESTS_SHOWN = 5

export function Tests(ui: Ui, props: TestsProps) {
  const { Box, Text } = ui
  const { id } = props
  const shown = props.tests.slice(-TESTS_SHOWN)
  const more = props.tests.length - shown.length
  return Block(ui, {
    id: `tests-${id}`,
    icon: 'tests',
    label: 'Tests',
    children: [
      <Box key={`tests-pills-${id}`} flexDirection="row" flexWrap="wrap" columnGap={across(4)} rowGap={down(4)} minWidth={0}>
        {shown.map((test, index) => (
          <Box key={`test-${id}-${index}`} flexDirection="row" alignItems="center" gap={across(4)} height={tall(24)} minWidth={0} flexShrink={1} paddingLeft={across(5)} paddingRight={across(7)} paddingY={0} borderStyle="round" borderColor={C.clear} backgroundColor={C.greenTint}>
            {Icon(ui, { id: `test-icon-${id}-${index}`, name: 'check', size: 12, tone: 'green', weight: 2.6 })}
            <Box flexShrink={1} minWidth={0}>
              <Text size="footnote" weight="semibold" color={C.text} wrap="truncate-end">
                {oneLine(test)}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>,
      more ? Quiet(ui, { text: `+${more} more` }) : null,
    ],
    gap: 8,
  })
}
