import { shownDots } from '../../lib/list'
import type { Block } from '../../lib/list'
import { across, down, textWidth } from '../../lib/layout'
import { dot, numeral } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import type { Ui } from '../types'

export type SummaryProps = { blocks: readonly Block[]; perRow: number; width: number }

export const CAPTION = 11

export const tileInnerOf = (width: number, perRow: number) => (width - (perRow - 1) * 8) / perRow - 2 - 16

export function subOf(one: Block, inner: number) {
  const subs = [one.sub, ...(one.shorts ?? [])]
  return subs.find(text => textWidth(text, CAPTION) <= inner) ?? subs.at(-1)
}

export function Summary(ui: Ui, props: SummaryProps) {
  const { Box, Text, Svg } = ui
  const inner = tileInnerOf(props.width, props.perRow)
  const block = (one: Block) => {
    const value = numeral(one.value, 'text')
    const hasIcon = one.isAlert && textWidth(one.label, CAPTION, { isBold: true }) + 12 + 4 <= inner
    const sub = subOf(one, inner)
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
        <Box flexDirection="row" alignItems="center" gap={across(4)} minWidth={0}>
          {hasIcon ? Icon(ui, { id: `block-icon-${one.key}`, name: 'needs', size: 12, tone: 'red', weight: 2.2 }) : null}
          <Box flexShrink={1} minWidth={0}>
            <Text size="caption" weight="semibold" color={C.muted} wrap="truncate-end">
              {one.label}
            </Text>
          </Box>
        </Box>
        <Svg key={`block-value-${one.key}`} source={value.source} alt={`${one.label} ${one.value}`} width={value.width} height={24} />
        {one.dots ? (
          <Box key={`block-dots-${one.key}`} flexDirection="row" alignItems="center" flexWrap="wrap" columnGap={across(4)} rowGap={0}>
            {shownDots(one).map(mark => (
              <Box key={`block-dot-box-${one.key}-${mark.tone}`} flexDirection="row" alignItems="center" gap={across(2)}>
                <Svg key={`block-dot-${one.key}-${mark.tone}`} source={dot(mark.tone, 6)} alt={mark.tone} width={6} height={6} />
                <Text size="caption" weight="semibold" color={C.muted} tabular>
                  {String(mark.count)}
                </Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Text size="caption" color={C.muted} wrap="truncate-end">
            {sub}
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
