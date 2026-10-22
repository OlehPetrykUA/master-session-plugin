import type { RenderChildren } from 'claude-code'

import { across, down, tall } from '../../lib/layout'
import type { IconName } from '../../theme/icons'
import { dot } from '../../theme/icons'
import { C } from '../../theme/tokens'
import type { Tone } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Icon } from '../Icon'
import type { Ui } from '../types'

export type GroupAction = { id: string; icon: IconName; label: string; onPress: () => void }

export type GroupProps = { id: string; label: string; count: number; tone?: Tone; icon?: IconName; isPinned: boolean; action?: GroupAction; children: RenderChildren }

export function Group(ui: Ui, props: GroupProps) {
  const { Box, Text, Svg } = ui
  return (
    <Box key={`group-${props.id}`} flexDirection="column" gap={down(4)}>
      <Box key={`group-head-${props.id}`} flexDirection="row" alignItems="center" gap={across(8)} height={tall(32)}>
        {props.tone ? <Svg key={`group-dot-${props.id}`} source={dot(props.tone, 8)} alt={props.label} width={8} height={8} /> : null}
        {props.icon ? Icon(ui, { id: `group-icon-${props.id}`, name: props.icon, size: 14, tone: 'muted' }) : null}
        <Text weight="semibold">{props.label}</Text>
        <Text color={C.muted} tabular>
          {String(props.count)}
        </Text>
        {props.isPinned ? (
          <Text size="footnote" color={C.faint} wrap="truncate-end">
            pinned on every filter
          </Text>
        ) : null}
        <Box flexGrow={1} />
        {props.action ? ActionButton(ui, { ...props.action, kind: 'ghost', size: 'b32', iconSize: 16 }) : null}
      </Box>
      <Box key={`group-rows-${props.id}`} flexDirection="column" gap={down(4)}>
        {props.children}
      </Box>
    </Box>
  )
}
