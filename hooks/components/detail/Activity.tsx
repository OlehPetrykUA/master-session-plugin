import { across, tall } from '../../lib/layout'
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
      const cut = one.text.indexOf(' ')
      const verb = cut > 0 ? one.text.slice(0, cut) : one.text
      const rest = cut > 0 ? one.text.slice(cut + 1) : ''
      return (
        <Box key={`activity-${id}-${index}`} flexDirection="row" alignItems="flex-start" gap={across(8)}>
          <Box flexDirection="row" alignItems="center" height={tall(20)}>
            <Svg key={`activity-dot-${id}-${index}`} source={dot(one.isGood ? 'green' : 'faint', 6)} alt={one.isGood ? 'ok' : 'event'} width={6} height={6} />
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text wrap="wrap">
              <Text weight="semibold">{verb}</Text>
              {rest ? ' ' : ''}
              {rest ? (
                <Text size="footnote" mono color={C.muted}>
                  {rest}
                </Text>
              ) : null}
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text size="footnote" color={C.muted} tabular>
              {one.ago}
            </Text>
          </Box>
        </Box>
      )
    }),
  })
}
