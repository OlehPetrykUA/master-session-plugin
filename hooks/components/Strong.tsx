import type { TextUi } from './types'

export type StrongProps = { text: string; isMono?: boolean; isFull?: boolean }

export function Strong(ui: TextUi, props: StrongProps) {
  const { Text } = ui
  return (
    <Text weight="semibold" mono={props.isMono || undefined} wrap={props.isFull ? 'wrap' : 'truncate-end'}>
      {props.text}
    </Text>
  )
}
