import { expect, test } from 'claude-code/testing'
import type { ElementConstructor, RenderElement, SvgProps, TextProps } from 'claude-code'

import { guardSvg } from './guard'

test('the Svg guard draws a drawing under 131072 characters and the alt text beyond it', () => {
  const drawn: string[] = []
  const Svg = ((props: SvgProps) => (drawn.push(`svg ${props.alt}`), {} as RenderElement)) as ElementConstructor<SvgProps>
  const Text = ((props: TextProps & { children?: unknown }) => (drawn.push(`text ${String(props.children)}`), {} as RenderElement)) as ElementConstructor<TextProps>
  const Safe = guardSvg(Svg, Text)
  Safe({ source: `<svg>${'x'.repeat(100)}</svg>`, alt: 'small' })
  Safe({ source: 'x'.repeat(131_072), alt: 'too big' })
  expect(drawn).toEqual(['svg small', 'text too big'])
})
