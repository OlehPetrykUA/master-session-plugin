import type { stepOf } from '../../lib/board'
import { across } from '../../lib/layout'
import { titleOf } from '../../lib/rows'
import type { Row } from '../../lib/rows'
import { badge, dot, ring } from '../../theme/icons'
import { C, LABEL, STATE_COLOR } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import type { Ui } from '../types'

export type DetailHeaderProps = { row: Row; step: ReturnType<typeof stepOf>; meta: readonly string[]; dirty: number; onCollapse: () => void }

export function DetailHeader(ui: Ui, props: DetailHeaderProps) {
  const { Box, Text, Svg } = ui
  const { row, step, meta, dirty } = props
  return (
    <Box flexDirection="row" alignItems="flex-start" gap={across(10)}>
      <Svg key={`detail-badge-${row.id}`} source={badge(row.state)} alt={LABEL[row.state]} width={32} height={32} />
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Text weight="semibold" size="heading" wrap="wrap">
          {titleOf(row)}
        </Text>
        <Box flexDirection="row" flexWrap="wrap" alignItems="flex-start" gap={across(4)} minWidth={0}>
          <Text size="footnote" weight="semibold" color={STATE_COLOR[row.state]}>
            {LABEL[row.state]}
          </Text>
          <Box flexShrink={1} minWidth={0}>
            <Text size="footnote" color={C.muted} wrap="wrap">
              {meta.map(part => ` · ${part}`).join('')}
            </Text>
          </Box>
          {dirty ? (
            <Box flexDirection="row" alignItems="center" gap={across(4)}>
              <Text size="footnote" color={C.muted}>
                ·
              </Text>
              <Svg key={`detail-dirty-${row.id}`} source={dot('text', 6)} alt="uncommitted" width={6} height={6} />
              <Text size="footnote" color={C.muted} tabular>
                {String(dirty)}
              </Text>
            </Box>
          ) : null}
        </Box>
      </Box>
      <Svg key={`detail-ring-${row.id}`} source={ring(step?.done ?? 0, step?.total ?? 0, row.state)} alt={step ? `step ${step.done} of ${step.total}` : 'no steps yet'} width={34} height={34} />
      {ActionButton(ui, { id: `collapse-${row.id}`, kind: 'ghost', icon: 'collapse', label: 'Collapse', onPress: props.onCollapse })}
    </Box>
  )
}
