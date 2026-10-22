import type { BandView } from '../../lib/band'
import type { Progress } from '../../lib/board'
import type { StripTone } from '../../theme/strip'
import type { TextUi } from '../types'

export type TextBandProps = { view: BandView; progress: Progress; columns: number }

const TERMINAL: Record<StripTone, string> = { red: 'error', failed: 'error', amber: 'warning', green: 'success', grey: 'subtle' }

export function TextBand(ui: TextUi, props: TextBandProps) {
  const { Box, Text, Button } = ui
  const { view, columns } = props
  const { items, asker, isAllDone, percent, counts, extras, action, showCounts, pillText } = view
  const lead = asker ? `● ${pillText}` : isAllDone ? '✓' : `${percent}%`.padStart(4)
  const more = showCounts && extras ? (counts ? `· ${extras}` : extras) : ''
  const marks = items.reduce((sum, one) => sum + (one.kind === 'subagent' ? 2 : one.kind === 'workflow' ? (one.pieces ?? 1) + 1 : 0), 0)
  const sessions = Math.max(1, items.filter(one => one.kind === 'session').length)
  const fixed = lead.length + (showCounts ? counts.length : 0) + (more ? more.length + 1 : 0) + (action?.label.length ?? 0) + marks + 12
  const cells = Math.max(1, Math.min(8, Math.floor((columns - fixed) / sessions) - 1))
  const toneOf = (tone: StripTone) => (isAllDone ? 'success' : TERMINAL[tone])
  return (
    <Box flexDirection="row" gap={1}>
      <Text color={asker ? 'error' : isAllDone ? 'success' : undefined} weight="semibold">
        {lead}
      </Text>
      {items.map(one => {
        if (one.kind === 'subagent') return <Text color={toneOf(one.tone)} dimColor={!!asker || undefined}>•</Text>
        if (one.kind === 'workflow') {
          const pieces = one.pieces ?? 1
          const filled = Math.round(pieces * Math.min(1, one.fill))
          return <Text color={toneOf(one.tone)} dimColor={!!asker || undefined}>{'■'.repeat(filled) + '□'.repeat(pieces - filled)}</Text>
        }
        const filled = Math.max(1, Math.round(cells * Math.min(1, one.fill)))
        return (
          <Text color={toneOf(one.tone)} dimColor={!!asker || undefined}>
            {'█'.repeat(filled) + '░'.repeat(cells - filled)}
          </Text>
        )
      })}
      {showCounts && counts ? <Text dimColor>{counts}</Text> : null}
      {more ? <Text weight="semibold">{more}</Text> : null}
      {action ? <Button key={`band-${action.name}`} variant="primary" label={action.label} onPress={action.press} /> : null}
    </Box>
  )
}
