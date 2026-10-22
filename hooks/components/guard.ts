import type { ElementConstructor, SvgProps, TextProps } from 'claude-code'

import { fitsSvg } from '../data/contract'

export function guardSvg(Svg: ElementConstructor<SvgProps>, Text: ElementConstructor<TextProps>): ElementConstructor<SvgProps> {
  return props => (fitsSvg(props.source) ? Svg(props) : Text({ dimColor: true, children: props.alt }))
}
