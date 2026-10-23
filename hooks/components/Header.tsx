import { across, down, tall } from '../lib/layout'
import { liveDot } from '../theme/icons'
import type { IconName } from '../theme/icons'
import type { Tone } from '../theme/tokens'
import { ActionButton } from './ActionButton'
import { Icon } from './Icon'
import type { Ui } from './types'

export type HeaderButton = { id: string; icon: IconName; label: string; onPress: () => void; isPressed?: boolean; isQuiet?: boolean }

export type HeaderProps = { title: string; isLive: boolean; status: { text: string; icon: IconName; tone: Tone }; buttons: readonly HeaderButton[]; isNarrow: boolean }

export function Header(ui: Ui, props: HeaderProps) {
  const { Box, Text, Svg } = ui
  const color = props.status.tone === 'amber' ? 'warning' : 'inactive'
  const title = (
    <Box key="header-title" flexDirection="column" gap={down(2)} minWidth={0} flexShrink={1}>
      <Box flexDirection="row" alignItems="center" gap={across(8)}>
        <Text weight="semibold" size="heading" wrap="truncate-end">
          {props.title}
        </Text>
        <Svg key="live" source={liveDot(props.isLive ? 'green' : 'amber')} alt={props.isLive ? 'live' : 'live data unavailable'} width={14} height={14} />
      </Box>
      <Box flexDirection="row" alignItems="flex-start" gap={across(4)}>
        {Icon(ui, { id: 'header-status-icon', name: props.status.icon, size: 12, tone: props.status.tone })}
        <Text size="footnote" color={color} wrap="wrap">
          {props.status.text}
        </Text>
      </Box>
    </Box>
  )
  const buttons = props.buttons.map(button => ActionButton(ui, { ...button, kind: 'ghost', size: 'b32', iconSize: 16 }))
  if (props.isNarrow)
    return (
      <Box key="section-header" flexDirection="column" flexShrink={0} gap={down(8)} paddingTop={down(12)} paddingBottom={down(8)} paddingLeft={across(16)} paddingRight={across(8)}>
        {title}
        <Box key="header-buttons" flexDirection="row" justifyContent="flex-end" gap={across(4)}>
          {buttons}
        </Box>
      </Box>
    )
  return (
    <Box key="section-header" flexDirection="row" alignItems="center" flexShrink={0} gap={across(8)} minHeight={tall(56)} paddingLeft={across(16)} paddingRight={across(8)}>
      {title}
      <Box flexGrow={1} />
      {buttons}
    </Box>
  )
}
