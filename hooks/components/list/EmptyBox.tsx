import { across, down } from '../../lib/layout'
import type { IconName } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Icon } from '../Icon'
import type { Ui } from '../types'

export type EmptyBoxProps = { id: string; icon: IconName; title: string; body: string; command?: string; onShowAll?: () => void }

export function EmptyBox(ui: Ui, props: EmptyBoxProps) {
  const { Box, Text } = ui
  const [before, after] = props.command ? props.body.split(props.command) : [props.body, '']
  return (
    <Box key={`empty-${props.id}`} flexDirection="column" alignItems="center" gap={down(8)} paddingTop={down(24)} paddingBottom={down(24)} paddingX={across(16)} borderStyle="dashed" borderColor={C.borderStrong}>
      {Icon(ui, { id: `empty-icon-${props.id}`, name: props.icon, size: 24, tone: 'faint' })}
      <Text weight="bold">{props.title}</Text>
      <Text size="footnote" color={C.muted}>
        {before}
        {props.command ? <Text mono>{props.command}</Text> : null}
        {after}
      </Text>
      {props.onShowAll ? ActionButton(ui, { id: `show-all-${props.id}`, kind: 'link', icon: 'showAll', label: 'Show all', onPress: props.onShowAll, size: 'b32', iconSize: 16 }) : null}
    </Box>
  )
}
