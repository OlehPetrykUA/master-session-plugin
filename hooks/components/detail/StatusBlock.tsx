import type { Sentence } from '../../lib/status'
import { stateWordOf } from '../../lib/status'
import { STATUS } from '../../theme/icons'
import type { Status } from '../../theme/icons'
import { C } from '../../theme/tokens'
import type { Ui } from '../types'
import { Block } from './Block'

export type StatusBlockProps = { id: string; status: Status; sentence: Sentence }

export function StatusBlock(ui: Ui, props: StatusBlockProps) {
  const { Text } = ui
  const look = STATUS[stateWordOf(props.status).glyph]
  return Block(ui, {
    id: `status-${props.id}`,
    icon: look.icon,
    tone: look.tone,
    label: 'Status',
    isAlert: props.sentence.isAlert,
    children: [
      <Text key={`status-text-${props.id}`} color={C.text} wrap="wrap">
        {props.sentence.text}
      </Text>,
    ],
  })
}
