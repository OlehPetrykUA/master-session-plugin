import { C } from '../theme/tokens'
import type { TextUi } from './types'

export type QuietProps = { text: string; isMono?: boolean; isFull?: boolean }

export function Quiet(ui: TextUi, props: QuietProps) {
  const { Text } = ui
  return (
    <Text size="footnote" color={C.muted} mono={props.isMono || undefined} wrap={props.isFull ? 'wrap' : 'truncate-end'}>
      {props.text}
    </Text>
  )
}
