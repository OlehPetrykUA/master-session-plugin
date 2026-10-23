import { across, tall, textWidth } from '../../lib/layout'
import { rowsOf } from '../../lib/list'
import { commandOf, countOf, isFailed } from '../../lib/totals'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import type { Ui } from '../types'
import { Block } from './Block'

export type TestsProps = { id: string; tests: readonly string[]; width: number }

const LABEL_MAX = 140

const FAILED = ' · failed'

export function pillOf(test: string) {
  const name = commandOf(test)
  const count = countOf(test)
  const failed = isFailed(test)
  const text = failed ? name : count ? `${name} · ${count} pass` : name
  const tail = failed ? FAILED : ''
  const head = rowsOf(text, LABEL_MAX - textWidth(tail, 12, false, true), 12, 1, false, true)[0] ?? text
  return { name, isFailed: failed, head, tail, label: `${head}${tail}` }
}

const pillWidthOf = (label: string) => 6 + 12 + 4 + Math.min(LABEL_MAX, textWidth(label, 12, false, true)) + 8

export function testsShownOf(tests: readonly string[], room: number) {
  const latest = [...tests]
    .reverse()
    .map(pillOf)
    .filter((pill, index, all) => all.findIndex(one => one.name === pill.name) === index)
  const pills = [...latest.filter(pill => pill.isFailed), ...latest.filter(pill => !pill.isFailed)]
  const moreWidth = (count: number) => (count ? 4 + textWidth(`+${count} more`, 12, false, true) : 0)
  let used = 0
  let shown = 0
  for (const pill of pills) {
    const next = used + (shown ? 4 : 0) + pillWidthOf(pill.label)
    if (shown && next + moreWidth(pills.length - shown - 1) > room) break
    used = next
    shown += 1
  }
  return { pills: pills.slice(0, shown), more: pills.length - shown }
}

export function Tests(ui: Ui, props: TestsProps) {
  const { Box, Text } = ui
  const { id } = props
  const { pills, more } = testsShownOf(props.tests, props.width - 24)
  return Block(ui, {
    id: `tests-${id}`,
    icon: 'tests',
    label: 'Tests',
    children: (
      <Box key={`tests-pills-${id}`} flexDirection="row" alignItems="center" gap={across(4)} height={tall(24)} minWidth={0}>
        {pills.map((test, index) => (
          <Box key={`test-${id}-${index}`} flexDirection="row" alignItems="center" gap={across(4)} height={tall(24)} minWidth={0} flexShrink={1} paddingLeft={across(5)} paddingRight={across(7)} paddingY={0} borderStyle="round" borderColor={C.clear} backgroundColor={test.isFailed ? C.redTint : C.greenTint}>
            {test.isFailed ? Icon(ui, { id: `test-icon-${id}-${index}`, name: 'failed', size: 12, tone: 'red', weight: 2.2 }) : Icon(ui, { id: `test-icon-${id}-${index}`, name: 'check', size: 12, tone: 'green', weight: 2.6 })}
            <Box flexDirection="row" flexShrink={1} minWidth={0}>
              <Box flexShrink={1} minWidth={0}>
                <Text size="footnote" weight="semibold" color={C.text} wrap="truncate-end">
                  {test.head}
                </Text>
              </Box>
              {test.tail ? (
                <Box flexShrink={0}>
                  <Text size="footnote" weight="semibold" color={C.text}>
                    {test.tail}
                  </Text>
                </Box>
              ) : null}
            </Box>
          </Box>
        ))}
        {more ? (
          <Box key={`tests-more-${id}`} flexShrink={0}>
            <Text size="footnote" weight="semibold" color={C.muted}>{`+${more} more`}</Text>
          </Box>
        ) : null}
      </Box>
    ),
    gap: 8,
  })
}
