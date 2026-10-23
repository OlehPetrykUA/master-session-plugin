import type { TextProps } from 'claude-code'

import type { Ui } from './types'

export type LinesProps = { id: string; rows: readonly string[]; size?: TextProps['size']; weight?: TextProps['weight']; color?: string; isMono?: boolean }

export function Lines(ui: Ui, props: LinesProps) {
  const { Box, Text } = ui
  return (
    <Box key={props.id} flexDirection="column" minWidth={0}>
      {props.rows.map((row, index) => (
        <Text key={`${props.id}-${index}`} size={props.size} weight={props.weight} color={props.color} mono={props.isMono || undefined} wrap="truncate-end">
          {row}
        </Text>
      ))}
    </Box>
  )
}
