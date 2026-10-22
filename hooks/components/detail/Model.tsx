import { across } from '../../lib/layout'
import { modelFamilyOf } from '../../lib/list'
import type { IconName } from '../../theme/icons'
import { Icon } from '../Icon'
import type { Ui } from '../types'

const FAMILIES: readonly IconName[] = ['opus', 'sonnet', 'haiku', 'fable']

export const familyGlyph = (model: string | undefined): IconName => FAMILIES.find(one => one === modelFamilyOf(model)) ?? 'modelChip'

export type ModelValueProps = { id: string; model: string | undefined; text: string }

export function ModelValue(ui: Ui, props: ModelValueProps) {
  const { Box, Text } = ui
  return (
    <Box key={`model-value-${props.id}`} flexDirection="row" alignItems="center" gap={across(4)}>
      {Icon(ui, { id: `model-glyph-${props.id}`, name: familyGlyph(props.model), size: 14, tone: 'muted' })}
      <Text weight="semibold">{props.text}</Text>
    </Box>
  )
}
