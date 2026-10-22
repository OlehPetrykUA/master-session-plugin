import { PERCENT } from '../../lib/band'
import type { BandView } from '../../lib/band'
import type { Progress } from '../../lib/board'
import { across, tall } from '../../lib/layout'
import { glyph } from '../../theme/icons'
import type { IconName } from '../../theme/icons'
import { strip } from '../../theme/strip'
import { C, KINDS } from '../../theme/tokens'
import type { Tone } from '../../theme/tokens'
import type { Ui } from '../types'
import { BandButton } from './BandButton'

export type BandProps = { view: BandView; progress: Progress }

export function Band(ui: Ui, props: BandProps) {
  const { Box, Text, Svg } = ui
  const { view, progress } = props
  const { segments, asking, isAllDone, counts, alt, action, fitted, showCounts, pillText } = view
  const icon = (name: IconName, size: number, tone: Tone, weight = 1.9) => <Svg source={glyph(name, size, tone, weight)} alt={name} width={size} height={size} />
  const kind = asking ? 'primary' : 'tint'
  const stripWidth = fitted.strip
  const look = asking ? 'dim' : isAllDone ? 'done' : 'live'
  const lead = asking ? (
    <Box flexDirection="row" alignItems="center" flexShrink={1} minWidth={0} gap={across(6)} height={tall(34)} paddingLeft={across(9)} paddingRight={across(12)} paddingY={0} borderStyle="round" borderColor="error" backgroundColor={C.redTint}>
      {icon('needs', 15, 'red', 2)}
      <Text weight="semibold" color="error" wrap="truncate-end">
        {pillText}
      </Text>
    </Box>
  ) : isAllDone ? (
    icon('check', 18, 'green', 2.4)
  ) : (
    <Box flexDirection="row" flexShrink={0} width={across(PERCENT)}>
      <Text weight="bold" size="heading" tabular>
        {`${progress.percent}%`}
      </Text>
    </Box>
  )
  return (
    <Box flexDirection="row" alignItems="center" gap={across(view.gap)} height={tall(56)} paddingLeft={across(view.padLeft)} paddingRight={across(view.padRight)} paddingY={0} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
      {lead}
      {fitted.isDots ? (
        <Svg source={strip(stripWidth, segments, look)} alt={alt} width={stripWidth} height={10} isInteractive />
      ) : (
        <Box flexDirection="column" alignItems="stretch" flexGrow={1} flexShrink={1} width={0} minWidth={0}>
          <Svg source={strip(stripWidth, segments, look)} alt={alt} height={10} isInteractive />
        </Box>
      )}
      {showCounts ? (
        <Box flexDirection="row" alignItems="center" flexShrink={0} gap={across(6)} paddingLeft={across(6)} paddingRight={across(8)}>
          {icon(isAllDone ? 'done' : 'pulse', 15, 'muted')}
          <Text color={C.muted} tabular>
            {counts}
          </Text>
        </Box>
      ) : null}
      {fitted.isDots ? <Box flexGrow={1} /> : null}
      {action ? BandButton(ui, { name: action.name, label: action.label, art: icon(action.icon, 15, KINDS[kind].tone), onPress: action.press, kind, width: view.actionWidth, left: view.left, right: view.right }) : null}
    </Box>
  )
}
