import { across, faceWidth, tall } from '../lib/layout'
import type { IconName } from '../theme/icons'
import { C, KINDS, LABEL_COLOR, SIZES } from '../theme/tokens'
import type { Kind, Size } from '../theme/tokens'
import { Hit } from './Hit'
import { Icon } from './Icon'
import type { Ui } from './types'

export type ActionButtonProps = { id: string; kind: Kind; icon: IconName; label: string; onPress: () => void; size?: Size; wide?: number }

export function ActionButton(ui: Ui, props: ActionButtonProps) {
  const { Box, Text, Button } = ui
  const [height, , , gap] = SIZES[props.size ?? 's']
  const one = KINDS[props.kind]
  const color = LABEL_COLOR[props.kind]
  const width = props.wide ?? faceWidth(props.label, props.size)
  const icon = (tone: typeof one.tone, suffix: string) => Icon(ui, { id: `${props.id}-${suffix}`, name: props.icon, size: 15, tone, weight: 1.9 })
  return (
    <Box
      key={`face-${props.id}`}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      gap={across(gap)}
      width={props.wide === undefined ? across(width) : '100%'}
      flexShrink={props.wide === undefined ? 0 : 1}
      minWidth={0}
      height={tall(height)}
      paddingX={0}
      paddingY={0}
      borderStyle="round"
      borderColor={one.border}
      backgroundColor={one.bg}
      hover={{ backgroundColor: one.hoverBg, borderColor: one.hoverBorder }}
    >
      {one.isDim ? (
        <Box flexDirection="row">
          <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }}>
            {icon('text', 'icon-hot')}
          </Box>
          {icon(one.tone, 'icon')}
        </Box>
      ) : (
        icon(one.tone, 'icon')
      )}
      {ui.Client ? (
        <Text weight="semibold" color={color.rest} hover={{ color: color.hover }} wrap="truncate-end">
          {props.label}
        </Text>
      ) : (
        <Button key={props.id} plain dimColor={one.isDim || undefined} label={props.label} onPress={props.onPress} hover={{ backgroundColor: C.clear, color: C.text }} />
      )}
      {Hit(ui, { id: props.id, width, height, onPress: props.onPress })}
    </Box>
  )
}
