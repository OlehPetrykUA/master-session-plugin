import { across, down } from '../../lib/layout'
import { STATUS } from '../../theme/icons'
import type { IconName, Status } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Ui } from '../types'

export type CalloutProps = { id: string; status: Status; icon?: IconName; label: string; lines: readonly { text: string; isStrong: boolean }[] }

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
        {props.lines.map(line => (line.isStrong ? Strong(ui, { text: line.text, isFull: true }) : Quiet(ui, { text: line.text, isFull: true })))}
      </Box>
    </Box>
  )
}
