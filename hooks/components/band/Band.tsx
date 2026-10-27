import type { BandView } from '../../lib/band'
import { ALL_DONE_GAP, ELAPSED_GAP, ELAPSED_ICON } from '../../lib/band'
import { across, tall } from '../../lib/layout'
import { BAR, BUTTON, CHECK, PERCENT, PILL } from '../../theme/band'
import { glyph } from '../../theme/icons'
import type { IconName } from '../../theme/icons'
import { strip } from '../../theme/strip'
import { C, KINDS } from '../../theme/tokens'
import type { Tone } from '../../theme/tokens'
import type { Ui } from '../types'
import { BandButton } from './BandButton'

export type BandProps = { view: BandView }

export function Band(ui: Ui, props: BandProps) {
  const { Box, Text, Svg } = ui
  const { view } = props
  const { asker, parts, alt, action, showCounts, pillText } = view
  const icon = (name: IconName, size: number, tone: Tone, weight = 1.9, alt: string = name) => <Svg source={glyph(name, size, tone, weight)} alt={alt} width={size} height={size} />
  const kind = asker ? 'primary' : 'tint'
  const lead = asker ? (
    <Box flexDirection="row" alignItems="center" flexShrink={1} minWidth={0} gap={across(PILL.gap)} height={tall(PILL.height)} paddingLeft={across(PILL.left)} paddingRight={across(PILL.right)} paddingY={0} borderStyle="round" borderColor={C.red} backgroundColor={C.redTint}>
      {icon(asker.glyph, PILL.icon, 'red', 2)}
      <Text weight="semibold" color={C.text} wrap="truncate-end">
        {pillText}
      </Text>
    </Box>
  ) : view.hasAllDone ? (
    <Box flexDirection="row" alignItems="center" flexShrink={0} gap={across(ALL_DONE_GAP)}>
      {icon('check', CHECK, 'green', 2.4)}
      <Text weight="semibold" color={C.text} size="heading">
        {view.allDone}
      </Text>
    </Box>
  ) : view.hasPercent ? (
    <Box flexDirection="row" flexShrink={0} width={across(PERCENT)}>
      <Text weight="semibold" color={C.text} size="heading" tabular>
        {`${view.percent}%`}
      </Text>
    </Box>
  ) : null
  const counter = showCounts ? (
    <Box flexDirection="row" alignItems="center" flexShrink={0}>
      <Text color={C.muted} wrap="truncate-end">
        {parts.map((part, index) =>
          part.isNumber ? (
            <Text key={`c${index}`} weight="semibold" color={C.text} tabular>
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )}
      </Text>
    </Box>
  ) : null
  const bar = (
    <Box key={`bar-${view.barWidth}-${view.isRunning ? 'run' : 'still'}`} flexDirection="column" alignItems="stretch" flexGrow={1} flexShrink={1} width={0} minWidth={0}>
      <Svg source={strip({ width: view.barWidth, overall: view.overall, tone: view.tone, isSliding: view.isRunning })} alt={alt} height={6} />
    </Box>
  )
  const elapsed = view.hasElapsed ? (
    <Box flexDirection="row" alignItems="center" flexShrink={0} gap={across(ELAPSED_GAP)}>
      {icon('elapsed', ELAPSED_ICON, 'muted', 2)}
      <Text size="footnote" color={C.muted} tabular>
        {view.elapsed}
      </Text>
    </Box>
  ) : null
  return (
    <Box flexDirection="row" alignItems="center" gap={across(view.gap)} height={tall(BAR.height)} paddingLeft={across(view.padLeft)} paddingRight={across(view.padRight)} paddingY={0} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
      {lead}
      {bar}
      {counter}
      {elapsed}
      {action ? BandButton(ui, { name: action.name, label: action.label, accessibleName: action.accessibleName, art: icon(action.icon, BUTTON.icon, KINDS[kind].tone, 1.9, action.accessibleName), onPress: action.press, kind, width: view.actionWidth, height: view.actionHeight, isIconOnly: action.isIconOnly }) : null}
    </Box>
  )
}
