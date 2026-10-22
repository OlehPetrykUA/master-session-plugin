import type { BandView } from '../../lib/band'
import type { Progress } from '../../lib/board'
import { across, tall } from '../../lib/layout'
import { BAR, BUTTON, CHECK, COUNTS, PERCENT, PILL } from '../../theme/band'
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
  const { view } = props
  const { items, asker, isAllDone, counts, extras, alt, action, fitted, showCounts, pillText } = view
  const icon = (name: IconName, size: number, tone: Tone, weight = 1.9) => <Svg source={glyph(name, size, tone, weight)} alt={name} width={size} height={size} />
  const kind = asker ? 'primary' : 'tint'
  const stripWidth = fitted.strip
  const look = asker ? 'dim' : isAllDone ? 'done' : 'live'
  const lead = asker ? (
    <Box flexDirection="row" alignItems="center" flexShrink={1} minWidth={0} gap={across(PILL.gap)} height={tall(PILL.height)} paddingLeft={across(PILL.left)} paddingRight={across(PILL.right)} paddingY={0} borderStyle="round" borderColor={C.red} backgroundColor={C.redTint}>
      {icon('needs', PILL.icon, 'red', 2)}
      <Text weight="semibold" color={C.text} wrap="truncate-end">
        {pillText}
      </Text>
    </Box>
  ) : isAllDone ? (
    icon('check', CHECK, 'green', 2.4)
  ) : (
    <Box flexDirection="row" flexShrink={0} width={across(PERCENT)}>
      <Text weight="semibold" size="heading" tabular>
        {`${view.percent}%`}
      </Text>
    </Box>
  )
  const counter = showCounts ? (
    <Box flexDirection="row" alignItems="center" flexShrink={0} gap={across(COUNTS.gap)} paddingLeft={across(COUNTS.left)} paddingRight={across(COUNTS.right)}>
      {icon(isAllDone ? 'done' : 'pulse', COUNTS.icon, 'muted')}
      {counts ? (
        <Text color={C.muted} tabular>
          {counts}
          {extras ? ' · ' : null}
          {extras ? (
            <Text color={C.text} weight="semibold">
              {extras}
            </Text>
          ) : null}
        </Text>
      ) : (
        <Text color={C.text} weight="semibold" tabular>
          {extras}
        </Text>
      )}
    </Box>
  ) : null
  return (
    <Box flexDirection="row" alignItems="center" gap={across(view.gap)} height={tall(BAR.height)} paddingLeft={across(view.padLeft)} paddingRight={across(view.padRight)} paddingY={0} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
      {lead}
      {fitted.isDots ? (
        <Box flexDirection="row" alignItems="center" gap={across(view.gap)} flexGrow={1} flexShrink={0}>
          <Svg source={strip(stripWidth, items, look, true)} alt={alt} width={stripWidth} height={10} isInteractive />
          {counter}
        </Box>
      ) : (
        <Box flexDirection="column" alignItems="stretch" flexGrow={1} flexShrink={1} width={0} minWidth={0}>
          <Svg source={strip(stripWidth, items, look)} alt={alt} height={10} isInteractive />
        </Box>
      )}
      {fitted.isDots ? null : counter}
      {action ? BandButton(ui, { name: action.name, label: action.label, art: icon(action.icon, BUTTON.icon, KINDS[kind].tone), onPress: action.press, kind, width: view.actionWidth }) : null}
    </Box>
  )
}
