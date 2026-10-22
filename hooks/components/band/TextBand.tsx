import type { BandView } from '../../lib/band'
import type { Progress } from '../../lib/board'
import { TERMINAL_COLOR } from '../../theme/tokens'
import type { TextUi } from '../types'

export type TextBandProps = { view: BandView; progress: Progress; columns: number }

export function TextBand(ui: TextUi, props: TextBandProps) {
  const { Box, Text, Button } = ui
  const { view, progress, columns } = props
  const { segments, asking, isAllDone, counts, action, showCounts, pillText } = view
  const lead = asking ? `● ${pillText}` : isAllDone ? '✓' : `${progress.percent}%`.padStart(4)
  const fixed = lead.length + (showCounts ? counts.length : 0) + (action?.label.length ?? 0) + 12
  const cells = Math.max(1, Math.min(8, Math.floor((columns - fixed) / segments.length) - 1))
  return (
    <Box flexDirection="row" gap={1}>
      <Text color={asking ? 'error' : isAllDone ? 'success' : undefined} weight="semibold">
        {lead}
      </Text>
      {segments.map(one => {
        const filled = Math.max(1, Math.round(cells * Math.min(1, one.fill)))
        return (
          <Text color={TERMINAL_COLOR[one.state]} dimColor={!!asking || undefined}>
            {'█'.repeat(filled) + '░'.repeat(cells - filled)}
          </Text>
        )
      })}
      {showCounts ? <Text dimColor>{counts}</Text> : null}
      {action ? <Button key={`band-${action.name}`} variant="primary" label={action.label} onPress={action.press} /> : null}
    </Box>
  )
}
