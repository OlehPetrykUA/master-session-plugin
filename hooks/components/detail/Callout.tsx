import { across, down } from '../../lib/layout'
import { rowsOf } from '../../lib/list'
import { STATUS } from '../../theme/icons'
import type { IconName, Status } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import { Lines } from '../Lines'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Ui } from '../types'

export type CalloutLine = { text: string; isStrong: boolean; isOneLine?: boolean; isMono?: boolean; rows?: number }

export type CalloutProps = { id: string; status: Status; icon?: IconName; label: string; lines: readonly CalloutLine[]; width?: number }

export function Callout(ui: Ui, props: CalloutProps) {
  const { Box, Text } = ui
  const look = STATUS[props.status]
  return (
    <Box key={`callout-${props.id}`} flexDirection="row" alignItems="flex-start" gap={across(12)} paddingX={across(11)} paddingY={down(11)} borderStyle="round" borderColor={C.clear} backgroundColor={look.box}>
      {Icon(ui, { id: `callout-icon-${props.id}`, name: props.icon ?? look.icon, size: 20, tone: look.tone, weight: 1.75 })}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gap={down(2)}>
        <Text size="caption" weight="semibold" color={C.text}>
          {props.label.toUpperCase()}
        </Text>
        {props.lines.map((line, index) => (line.rows ? Lines(ui, { id: `callout-${props.id}-rows-${index}`, rows: rowsOf(line.text, (props.width ?? 0) - 56, line.isStrong ? 13 : 12, line.rows, line.isMono, line.isStrong), size: line.isStrong ? undefined : 'footnote', weight: line.isStrong ? 'semibold' : undefined, color: line.isStrong || line.isMono ? C.text : C.muted, isMono: line.isMono }) : line.isStrong ? Strong(ui, { text: line.text, isFull: !line.isOneLine }) : Quiet(ui, { text: line.text, isFull: !line.isOneLine })))}
      </Box>
    </Box>
  )
}
