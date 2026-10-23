import { across, down, tall } from '../lib/layout'
import type { narrativeOf } from '../lib/view'
import { C } from '../theme/tokens'
import { ActionButton } from './ActionButton'
import { Lines } from './Lines'
import type { Ui } from './types'

type NarrativeView = NonNullable<ReturnType<typeof narrativeOf>>

export function Narrative(ui: Ui, props: { narrative: NarrativeView; onToggle: () => void }) {
  const { Box, Text } = ui
  const { narrative } = props
  return (
    <Box key="section-narrative" flexDirection="column" gap={down(4)} paddingLeft={across(16)} paddingRight={across(16)} paddingTop={down(12)}>
      {Lines(ui, { id: 'narrative-text', rows: narrative.rows, color: narrative.isStale ? C.muted : C.text })}
      <Box key="narrative-age-row" flexDirection="row" alignItems="center" gap={across(8)} height={tall(narrative.hasMore ? 32 : 16)}>
        <Box key="narrative-age-room" flexShrink={1} minWidth={0}>
          <Text key="narrative-age" size="footnote" color={C.muted} tabular wrap="truncate-end">
            {narrative.age}
          </Text>
        </Box>
        <Box flexGrow={1} />
        {narrative.hasMore
          ? ActionButton(ui, { id: 'narrative-more', kind: 'ghost', size: 'b32', iconSize: 16, icon: narrative.isOpen ? 'collapse' : 'expand', label: narrative.isOpen ? 'Less' : 'More', onPress: props.onToggle })
          : null}
      </Box>
    </Box>
  )
}
