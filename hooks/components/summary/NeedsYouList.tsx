import { across, down, tall } from '../../lib/layout'
import { titleOf } from '../../lib/rows'
import type { Row } from '../../lib/rows'
import { badge, dot } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Quiet } from '../Quiet'
import type { Actions, Ui } from '../types'

export type NeedsYouListProps = { needs: readonly Row[]; actions: Actions }

export function NeedsYouList(ui: Ui, props: NeedsYouListProps) {
  const { Box, Text, Svg } = ui
  const { needs, actions } = props
  return (
    <Box key="summary-needs" flexDirection="column" gap={down(8)}>
      <Box flexDirection="row" alignItems="center" gap={across(6)}>
        <Svg key="summary-needs-dot" source={dot('red')} alt="needs you" width={7} height={7} />
        <Text weight="semibold">Needs you</Text>
        <Text color={C.muted}>{String(needs.length)}</Text>
      </Box>
      {needs.map(row => (
        <Box key={`summary-need-${row.id}`} flexDirection="row" alignItems="center" gap={across(10)} height={tall(56)} paddingLeft={across(12)} paddingRight={across(10)} paddingY={0} borderStyle="round" borderColor={C.red} backgroundColor={C.surface}>
          <Svg key={`summary-need-icon-${row.id}`} source={badge('needs-you', 30, 9, 16)} alt="needs you" width={30} height={30} />
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            <Text weight="semibold" size="heading" wrap="truncate-end">
              {titleOf(row)}
            </Text>
            {Quiet(ui, { text: row.board?.needsYou ?? 'needs you' })}
          </Box>
          {row.live ? ActionButton(ui, { id: `summary-chat-${row.id}`, kind: 'primary', icon: 'chat', label: 'Open chat', onPress: () => actions.open(row.id, row.name), size: 'm' }) : null}
        </Box>
      ))}
    </Box>
  )
}
