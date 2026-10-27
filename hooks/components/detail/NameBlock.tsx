import { C } from '../../theme/tokens'
import type { IconName } from '../../theme/icons'
import type { Ui } from '../types'
import { Block } from './Block'

export type NameBlockProps = { id: string; icon: IconName; name: { full: string; ident: string } }

export function NameBlock(ui: Ui, props: NameBlockProps) {
  const { Text } = ui
  return Block(ui, {
    id: `name-${props.id}`,
    icon: props.icon,
    label: 'Name',
    children: [
      <Text key={`name-full-${props.id}`} weight="semibold" color={C.text} wrap="wrap">
        {props.name.full}
      </Text>,
      <Text key={`name-ident-${props.id}`} size="footnote" mono color={C.muted} wrap="wrap">
        {props.name.ident}
      </Text>,
    ],
  })
}
