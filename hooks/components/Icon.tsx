import { figure } from '../theme/detail'
import type { Figure } from '../theme/detail'
import { I, glyph } from '../theme/icons'
import type { IconName } from '../theme/icons'
import type { Tone } from '../theme/tokens'
import type { Ui } from './types'

export type Glyph = IconName | Figure

export type IconProps = { id: string; name: Glyph; size: number; tone: Tone; weight?: number; alt?: string }

export const isIcon = (name: Glyph): name is IconName => name in I

export function Icon(ui: Ui, props: IconProps) {
  const { Svg } = ui
  const weight = props.weight ?? 2
  const source = isIcon(props.name) ? glyph(props.name, props.size, props.tone, weight) : figure(props.name, props.size, props.tone, weight)
  return <Svg key={props.id} source={source} alt={props.alt ?? props.name} width={props.size} height={props.size} />
}
