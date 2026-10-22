import type { RenderChildren } from 'claude-code'

import { across, tall } from '../lib/layout'
import { C } from '../theme/tokens'
import type { TextUi } from './types'

export type ListRowProps = { id: string; mark: RenderChildren; name: string; meta: RenderChildren; actions: RenderChildren; isFirst: boolean }

export function ListRow(ui: TextUi, props: ListRowProps) {
  const { Box, Text } = ui
  return (
    <Box key={`${props.id}-wrap`} flexDirection="column">
      {props.isFirst ? null : <Box key={`${props.id}-rule`} height={tall(1)} marginX={across(6)} backgroundColor={C.border} />}
      <Box key={props.id} flexDirection="row" alignItems="center" gap={across(6)} height={tall(52)} paddingLeft={across(12)} paddingRight={across(6)} paddingY={0}>
        {props.mark}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text weight="semibold" size="heading" wrap="truncate-end">
            {props.name}
          </Text>
          {props.meta}
        </Box>
        {props.actions}
      </Box>
    </Box>
  )
}
