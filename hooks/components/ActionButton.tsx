import { across, faceWidth, tall, widthOf } from '../lib/layout'
import { buttonFace } from '../theme/icons'
import type { FaceLook } from '../theme/icons'
import { C, KINDS, LABEL_COLOR, SIZES } from '../theme/tokens'
import type { Kind, Size, Tone } from '../theme/tokens'
import { Hit } from './Hit'
import { Icon, isIcon } from './Icon'
import type { Glyph } from './Icon'
import type { Ui } from './types'

export type ActionButtonProps = {
  id: string
  kind: Kind
  icon: Glyph
  label: string
  onPress: () => void
  size?: Size
  wide?: number
  iconSize?: number
  isPressed?: boolean
  isQuiet?: boolean
  isIconOnly?: boolean
}

export const PRIMARY: { rest: FaceLook; hover: FaceLook } = { rest: { fill: 'accentBtn', ink: 'onAccent' }, hover: { fill: 'accentBtnHover', ink: 'onAccent' } }

const LINK: { rest: FaceLook; hover: FaceLook } = { rest: { ink: 'accentText' }, hover: { fill: 'hoverBg', ink: 'accentText', isUnderlined: true } }

export function ActionButton(ui: Ui, props: ActionButtonProps) {
  const { Box, Text, Button, Svg } = ui
  const [height, , , gap] = SIZES[props.size ?? 's']
  const one = KINDS[props.kind]
  const color = LABEL_COLOR[props.kind]
  const iconSize = props.iconSize ?? 15
  const width = props.isIconOnly ? height : (props.wide ?? faceWidth(props.label, props.size) + iconSize - 15)
  const rest: Tone = props.isQuiet ? 'faint' : props.isPressed ? 'text' : one.tone
  const labelColor = props.isQuiet ? C.faint : props.isPressed ? C.text : color.rest
  const look = props.kind === 'primary' ? PRIMARY : props.kind === 'link' ? LINK : undefined
  const isWide = props.wide !== undefined && !props.isIconOnly
  if (look && ui.Client && (props.kind === 'primary' || !isWide) && isIcon(props.icon)) {
    const [, start] = SIZES[props.size ?? 's']
    const text = props.isIconOnly ? '' : props.label
    const left = isWide ? Math.max(start, (width - iconSize - gap - widthOf(props.label) * 1.08) / 2) : start
    return (
      <Box key={`face-${props.id}`} flexDirection="row" flexShrink={isWide ? 1 : 0} width={isWide ? '100%' : across(width)} minWidth={0} height={tall(height)} paddingX={0} paddingY={0}>
        <Svg key={`${props.id}-face`} source={buttonFace(width, height, props.icon, text, look.rest, left, gap, iconSize)} alt={props.label} width={width} height={height} />
        <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }}>
          <Svg key={`${props.id}-face-hot`} source={buttonFace(width, height, props.icon, text, look.hover, left, gap, iconSize)} alt={props.label} width={width} height={height} />
        </Box>
        {Hit(ui, { id: props.id, width, height, onPress: props.onPress })}
      </Box>
    )
  }
  const icon = (tone: Tone, suffix: string) => Icon(ui, { id: `${props.id}-${suffix}`, name: props.icon, size: iconSize, tone, weight: 1.9, alt: props.isIconOnly ? props.label : props.icon })
  return (
    <Box
      key={`face-${props.id}`}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      gap={across(gap)}
      width={props.wide === undefined || props.isIconOnly ? across(width) : '100%'}
      flexShrink={props.wide === undefined || props.isIconOnly ? 0 : 1}
      minWidth={0}
      height={tall(height)}
      paddingX={0}
      paddingY={0}
      borderStyle="round"
      borderColor={one.border}
      backgroundColor={props.isPressed ? C.pressBg : one.bg}
      hover={{ backgroundColor: props.isPressed ? C.pressBg : one.hoverBg, borderColor: one.hoverBorder }}
    >
      {one.isDim && !props.isQuiet && !props.isPressed ? (
        <Box flexDirection="row">
          <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }}>
            {icon('text', 'icon-hot')}
          </Box>
          {icon(rest, 'icon')}
        </Box>
      ) : (
        icon(rest, 'icon')
      )}
      {ui.Client && props.isIconOnly ? null : ui.Client ? (
        <Text weight="bold" color={labelColor} hover={props.kind === 'link' ? { color: color.hover, underline: true } : { color: props.isQuiet ? C.faint : color.hover }} wrap="truncate-end">
          {props.label}
        </Text>
      ) : (
        <Button key={props.id} plain dimColor={one.isDim || props.isQuiet || undefined} label={props.label} onPress={props.onPress} hover={{ backgroundColor: C.clear, color: C.text }} />
      )}
      {Hit(ui, { id: props.id, width, height, onPress: props.onPress })}
    </Box>
  )
}
