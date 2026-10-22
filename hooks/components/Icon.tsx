import { glyph } from '../theme/icons'
import type { IconName } from '../theme/icons'
import type { Tone } from '../theme/tokens'
import type { Ui } from './types'

export type IconProps = { id: string; name: IconName; size: number; tone: Tone; weight?: number; alt?: string }

export function Icon(ui: Ui, props: IconProps) {
  const { Svg } = ui
  return <Svg key={props.id} source={glyph(props.name, props.size, props.tone, props.weight ?? 2)} alt={props.alt ?? props.name} width={props.size} height={props.size} />
}
