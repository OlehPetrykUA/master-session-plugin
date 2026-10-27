import { C } from '../../theme/tokens'
import type { Ui } from '../types'
import { Block } from './Block'

export const DESCRIBING = 'Describing…'

export type TaskBlockProps = { id: string; task: { text: string } | 'pending' | undefined }

export function TaskBlock(ui: Ui, props: TaskBlockProps) {
  const { Text } = ui
  const { id, task } = props
  if (!task) return null
  return Block(ui, {
    id: `task-${id}`,
    icon: 'now',
    label: 'Task',
    children:
      task === 'pending' ? (
        <Text key={`task-pending-${id}`} size="footnote" color={C.muted}>
          {DESCRIBING}
        </Text>
      ) : (
        <Text key={`task-text-${id}`} color={C.text} wrap="wrap">
          {task.text}
        </Text>
      ),
  })
}
