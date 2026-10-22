import { ASK, across, down, headerLabelsOf, tall } from '../lib/layout'
import { liveDot } from '../theme/icons'
import type { IconName } from '../theme/icons'
import { ActionButton } from './ActionButton'
import type { Ui } from './types'

export type HeaderProps = {
  title: string
  isLive: boolean
  toggle?: { label: string; icon: IconName; onPress: () => void }
  onRefresh: () => void
  onAsk?: () => void
  columns: number
}

export function Header(ui: Ui, props: HeaderProps) {
  const { Box, Text, Svg } = ui
  const wanted = [props.toggle?.label ?? '', props.onAsk ? ASK : '', 'Refresh'].filter(Boolean)
  const { labels, isStacked } = headerLabelsOf(props.columns, props.title, wanted)
  const faces = [
    props.toggle ? { id: 'view-toggle', icon: props.toggle.icon, label: props.toggle.label, onPress: props.toggle.onPress } : undefined,
    props.onAsk ? { id: 'ask', icon: 'chat' as const, label: labels[wanted.indexOf(ASK)] ?? ASK, onPress: props.onAsk } : undefined,
    { id: 'refresh', icon: 'refresh' as const, label: 'Refresh', onPress: props.onRefresh },
  ].filter(face => face !== undefined)
  const buttons = faces.map(face => ActionButton(ui, { id: face.id, kind: 'ghost', icon: face.icon, label: face.label, onPress: face.onPress }))
  return (
    <Box key="section-header" flexDirection="column">
      <Box flexDirection="row" alignItems="center" gap={across(8)} height={tall(52)} paddingLeft={across(16)} paddingRight={across(8)}>
        <Box flexShrink={0}>
          <Text weight="semibold" size="heading">
            {props.title}
          </Text>
        </Box>
        <Svg key="live" source={liveDot(props.isLive ? 'green' : 'amber')} alt={props.isLive ? 'live' : 'live data unavailable'} width={14} height={14} />
        <Box flexGrow={1} />
        {isStacked ? null : buttons}
      </Box>
      {isStacked ? (
        <Box key="header-buttons" flexDirection="row" justifyContent="flex-end" gap={across(8)} height={tall(40)} paddingLeft={across(16)} paddingRight={across(8)} paddingBottom={down(8)}>
          {buttons}
        </Box>
      ) : null}
    </Box>
  )
}
