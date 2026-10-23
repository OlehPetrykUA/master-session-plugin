import { across, tall } from '../../lib/layout'
import { oneLine } from '../../lib/list'
import { dot } from '../../theme/icons'
import { C } from '../../theme/tokens'
import type { Ui } from '../types'
import { Block } from './Block'

export type ActivityLine = { text: string; ago: string; isGood: boolean }

export type ActivityProps = { id: string; activity: readonly ActivityLine[] }

export function Activity(ui: Ui, props: ActivityProps) {
  const { Box, Text, Svg } = ui
  const { id } = props
  return Block(ui, {
    id: `activity-${id}`,
    icon: 'list',
    label: 'Activity',
    children: props.activity.map((one, index) => {
      const text = oneLine(one.text)
      const cut = text.indexOf(' ')
      const verb = cut > 0 ? text.slice(0, cut) : text
      const rest = cut > 0 ? text.slice(cut + 1) : ''
      return (
        <Box key={`activity-${id}-${index}`} flexDirection="row" alignItems="center" gap={across(8)} height={tall(20)} minWidth={0}>
          <Box flexDirection="row" alignItems="center" height={tall(20)} flexShrink={0}>
            <Svg key={`activity-dot-${id}-${index}`} source={dot(one.isGood ? 'green' : 'faint', 6)} alt={one.isGood ? 'ok' : 'event'} width={6} height={6} />
          </Box>
          <Box key={`activity-text-${id}-${index}`} flexDirection="row" alignItems="center" gap={across(4)} flexGrow={1} flexShrink={1} minWidth={0}>
            <Box flexShrink={0}>
              <Text weight="semibold" wrap="truncate-end">
                {verb}
              </Text>
            </Box>
            {rest ? (
              <Box flexShrink={1} minWidth={0}>
                <Text size="footnote" mono color={C.muted} wrap="truncate-end">
                  {rest}
                </Text>
              </Box>
            ) : null}
          </Box>
          <Box flexShrink={0}>
            <Text size="footnote" color={C.muted} tabular>
              {oneLine(one.ago)}
            </Text>
          </Box>
        </Box>
      )
    }),
  })
}
