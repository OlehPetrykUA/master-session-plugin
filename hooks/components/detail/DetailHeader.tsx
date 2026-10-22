import type { SessionState } from '../../../types'

import { across, down } from '../../lib/layout'
import { badge, ring } from '../../theme/icons'
import { C, STATE_COLOR } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import type { Ui } from '../types'

export type DetailHeaderProps = {
  id: string
  state: SessionState
  title: string
  word: string
  parts: readonly string[]
  steps?: { done: number; total: number }
  onCollapse: () => void
}

export function DetailHeader(ui: Ui, props: DetailHeaderProps) {
  const { Box, Text, Svg } = ui
  const { id, state, steps } = props
  const rest = props.parts.filter(Boolean)
  return (
    <Box flexDirection="row" alignItems="flex-start" gap={across(12)}>
      <Svg key={`detail-badge-${id}`} source={badge(state)} alt={props.word} width={32} height={32} />
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gap={down(2)}>
        <Text weight="semibold" size="heading" wrap="wrap">
          {props.title}
        </Text>
        <Text size="footnote" color={C.muted} wrap="wrap">
          <Text weight="semibold" color={STATE_COLOR[state]}>
            {props.word}
          </Text>
          {rest.map(part => ` · ${part}`).join('')}
        </Text>
      </Box>
      {steps ? <Svg key={`detail-ring-${id}`} source={ring(steps.done, steps.total, state)} alt={`${steps.done} of ${steps.total}`} width={34} height={34} /> : null}
      {ActionButton(ui, { id: `collapse-${id}`, kind: 'ghost', icon: 'collapse', label: 'Collapse', size: 'b32', iconSize: 16, isIconOnly: true, onPress: props.onCollapse })}
    </Box>
  )
}
