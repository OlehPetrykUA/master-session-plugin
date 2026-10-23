import { across, tall, textWidth } from '../../lib/layout'
import { oneLine } from '../../lib/list'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import type { Ui } from '../types'
import { Block } from './Block'

export type TestsProps = { id: string; tests: readonly string[]; width: number }

const chipWidthOf = (label: string) => 2 + 5 + 12 + 4 + textWidth(label, 12) * 1.08 + 7

export function testsShownOf(tests: readonly string[], room: number) {
  const labels = [...new Set(tests.map(oneLine).reverse())].reverse()
  const moreWidth = (count: number) => (count ? 4 + textWidth(`+${count} more`, 12) * 1.08 : 0)
  let used = 0
  let shown = 0
  for (const label of [...labels].reverse()) {
    const next = used + (shown ? 4 : 0) + chipWidthOf(label)
    if (shown && next + moreWidth(labels.length - shown - 1) > room) break
    used = next
    shown += 1
  }
  return { labels: labels.slice(labels.length - shown), more: labels.length - shown }
}

export function Tests(ui: Ui, props: TestsProps) {
  const { Box, Text } = ui
  const { id } = props
  const { labels, more } = testsShownOf(props.tests, props.width - 24)
  return Block(ui, {
    id: `tests-${id}`,
    icon: 'tests',
    label: 'Tests',
    children: (
      <Box key={`tests-pills-${id}`} flexDirection="row" alignItems="center" gap={across(4)} height={tall(24)} minWidth={0}>
        {labels.map((test, index) => (
          <Box key={`test-${id}-${index}`} flexDirection="row" alignItems="center" gap={across(4)} height={tall(24)} minWidth={0} flexShrink={1} paddingLeft={across(5)} paddingRight={across(7)} paddingY={0} borderStyle="round" borderColor={C.clear} backgroundColor={C.greenTint}>
            {Icon(ui, { id: `test-icon-${id}-${index}`, name: 'check', size: 12, tone: 'green', weight: 2.6 })}
            <Box flexShrink={1} minWidth={0}>
              <Text size="footnote" weight="semibold" color={C.text} wrap="truncate-end">
                {test}
              </Text>
            </Box>
          </Box>
        ))}
        {more ? (
          <Box key={`tests-more-${id}`} flexShrink={0}>
            <Text size="footnote" color={C.muted}>{`+${more} more`}</Text>
          </Box>
        ) : null}
      </Box>
    ),
    gap: 8,
  })
}
