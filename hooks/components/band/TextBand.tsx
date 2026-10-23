import type { BandView } from '../../lib/band'
import { countsText } from '../../lib/band'
import type { BarTone } from '../../theme/strip'
import type { TextUi } from '../types'

export type TextBandProps = { view: BandView; columns: number }

const TERMINAL: Record<BarTone, string> = { red: 'error', green: 'success', grey: 'subtle' }

const CELLS = { least: 6, most: 24 }

export function TextBand(ui: TextUi, props: TextBandProps) {
  const { Box, Text, Button } = ui
  const { view, columns } = props
  const { asker, isAllDone, percent, parts, action, showCounts, pillText } = view
  const lead = asker ? `● ${pillText}` : isAllDone ? '✓' : view.hasPercent ? `${percent}%`.padStart(4) : ''
  const counts = showCounts ? countsText(parts) : ''
  const fixed = lead.length + counts.length + (action?.label.length ?? 0) + 12
  const cells = Math.max(CELLS.least, Math.min(CELLS.most, columns - fixed))
  const filled = view.isAllDone ? cells : Math.min(cells - 1, Math.max(view.isRunning || view.overall > 0 ? 1 : 0, Math.floor(cells * view.overall)))
  return (
    <Box flexDirection="row" gap={1}>
      {lead ? (
        <Text color={asker ? 'error' : isAllDone ? 'success' : undefined} weight="semibold">
          {lead}
        </Text>
      ) : null}
      <Text color={TERMINAL[view.tone]}>{'█'.repeat(filled) + '░'.repeat(cells - filled)}</Text>
      {counts ? (
        <Text dimColor>
          {parts.map((part, index) =>
            part.isNumber ? (
              <Text key={`c${index}`} weight="semibold" dimColor={false}>
                {part.text}
              </Text>
            ) : (
              part.text
            ),
          )}
        </Text>
      ) : null}
      {action ? <Button key={`band-${action.name}`} variant="primary" label={action.label} onPress={action.press} /> : null}
    </Box>
  )
}
