import type { Running } from '../../../types'

import { clockOf, spanOf } from '../../lib/list'
import { C } from '../../theme/tokens'
import { Strong } from '../Strong'
import type { Ui } from '../types'
import { Block } from './Block'

export type RunningBlockProps = { id: string; run: Running | undefined; at: number }

export function RunningBlock(ui: Ui, props: RunningBlockProps) {
  const { Box, Text } = ui
  const { id, run, at } = props
  if (!run) return null
  return Block(ui, {
    id: `running-${id}`,
    icon: 'working',
    label: 'Running',
    children: [
      Strong(ui, { text: run.tool, isFull: true }),
      run.text ? (
        <Box key={`running-${id}-text`} minWidth={0}>
          <Text size="footnote" color={C.text} mono wrap="wrap">
            {run.text}
          </Text>
        </Box>
      ) : null,
      <Box key={`running-${id}-since`} minWidth={0}>
        <Text size="footnote" color={C.muted} tabular wrap="wrap">
          {`since ${clockOf(run.since)} · ${spanOf(run.since, undefined, at)}`}
        </Text>
      </Box>,
    ],
  })
}
