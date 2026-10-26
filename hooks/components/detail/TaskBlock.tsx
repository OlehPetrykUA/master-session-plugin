import type { TaskText } from '../../../types'

import { rowsOf } from '../../lib/list'
import { C } from '../../theme/tokens'
import { Lines } from '../Lines'
import type { Ui } from '../types'
import { Block } from './Block'

export const DESCRIBING = 'Describing…'

export type TaskBlockProps = { id: string; name: string; task?: TaskText; room: number }

export function TaskBlock(ui: Ui, props: TaskBlockProps) {
  const { Box, Text } = ui
  const { id, task } = props
  return Block(ui, {
    id: `task-${id}`,
    icon: 'now',
    label: 'Task',
    children: [
      Lines(ui, { id: `task-title-${id}`, rows: rowsOf(props.name, props.room, 13, 2, { isBold: true }), weight: 'semibold', color: C.text }),
      task?.state === 'done' && task.text ? (
        <Box key={`task-plain-${id}`} flexDirection="column" minWidth={0}>
          <Text color={C.text} wrap="wrap">
            {task.text}
          </Text>
        </Box>
      ) : task?.state === 'pending' ? (
        <Box key={`task-plain-${id}`} flexDirection="column" minWidth={0}>
          <Text size="footnote" color={C.muted}>
            {DESCRIBING}
          </Text>
        </Box>
      ) : null,
    ],
  })
}

export const taskLinesOf = (name: string, task?: TaskText) => [`Task: ${name}`, task?.state === 'done' && task.text ? task.text : task?.state === 'pending' ? DESCRIBING : '']
