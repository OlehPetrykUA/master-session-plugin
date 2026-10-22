import type { Block } from '../../lib/list'
import { across, down } from '../../lib/layout'
import { dot, numeral } from '../../theme/icons'
import { C } from '../../theme/tokens'
import type { Ui } from '../types'

export type SummaryProps = { blocks: readonly Block[]; perRow: number }

export function Summary(ui: Ui, props: SummaryProps) {
  const { Box, Text, Svg } = ui
  const block = (one: Block) => {
    const muted = one.isAlert ? C.red : C.muted
    const value = numeral(one.value, one.isAlert ? 'red' : 'text')
    return (
      <Box
        key={`block-${one.key}`}
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        width={0}
        minWidth={0}
        paddingX={across(8)}
        paddingY={down(8)}
        borderStyle="round"
        borderColor={one.isAlert ? C.red : C.border}
        backgroundColor={one.isAlert ? C.redTint : C.surface}
      >
        <Text size="caption" weight="semibold" color={muted} wrap="truncate-end">
          {one.label}
        </Text>
        <Svg key={`block-value-${one.key}`} source={value.source} alt={`${one.label} ${one.value}`} width={value.width} height={24} />
        {one.dots ? (
          <Box flexDirection="row" alignItems="center" gap={across(4)}>
            {one.dots.map(mark => (
              <Box key={`block-${one.key}-${mark.tone}`} flexDirection="row" alignItems="center" gap={across(2)}>
                <Svg key={`block-dot-${one.key}-${mark.tone}`} source={dot(mark.tone, 6)} alt={mark.tone} width={6} height={6} />
                <Text size="caption" weight="semibold" color={muted} tabular>
                  {String(mark.count)}
                </Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Text size="caption" color={muted} wrap="truncate-end">
            {one.sub}
          </Text>
        )}
      </Box>
    )
  }
  const rows: Block[][] = []
  for (let index = 0; index < props.blocks.length; index += props.perRow) rows.push(props.blocks.slice(index, index + props.perRow))
  return (
    <Box key="section-summary" flexDirection="column" gap={down(8)} paddingLeft={across(16)} paddingRight={across(16)} paddingTop={down(12)}>
      {rows.map((row, index) => (
        <Box key={`blocks-${index}`} flexDirection="row" gap={across(8)}>
          {row.map(block)}
          {row.length < props.perRow ? <Box key={`blocks-pad-${index}`} flexGrow={props.perRow - row.length} width={0} /> : null}
        </Box>
      ))}
    </Box>
  )
}
