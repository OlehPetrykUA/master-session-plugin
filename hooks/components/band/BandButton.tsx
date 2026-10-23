import type { RenderElement } from 'claude-code'

import { HIT } from '../../lib/band'
import type { BandAction } from '../../lib/band'
import { CH, LH, PAD, across, spaces, tall } from '../../lib/layout'
import { BUTTON } from '../../theme/band'
import { C, KINDS, LABEL_COLOR } from '../../theme/tokens'
import type { Kind } from '../../theme/tokens'
import type { Ui } from '../types'

export type BandButtonProps = { name: BandAction; label: string; accessibleName: string; art: RenderElement; onPress: () => void; kind: Kind; width: number; isIconOnly?: boolean }

export function BandButton(ui: Ui, props: BandButtonProps) {
  const { Box, Text, Button, Client } = ui
  const { name, label, art, onPress, kind } = props
  const one = KINDS[kind]
  const color = LABEL_COLOR[kind]
  const key = `band-${name}`
  const shape = {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    height: tall(BUTTON.height),
    paddingX: 0,
    paddingY: 0,
    borderStyle: 'round',
    borderColor: one.border,
    backgroundColor: one.bg,
    hover: { backgroundColor: one.hoverBg, borderColor: one.hoverBorder },
  } as const
  if (Client) {
    const hit = `${HIT}${name}`
    const cols = Math.ceil(props.width / CH)
    const rows = Math.ceil(BUTTON.height / LH)
    return (
      <Box key={`face-${key}`} {...shape} justifyContent={props.isIconOnly ? 'center' : undefined} paddingLeft={props.isIconOnly ? 0 : across(BUTTON.left)} gap={across(BUTTON.gap)} width={across(props.width)}>
        {art}
        {props.isIconOnly ? null : (
          <Text weight="semibold" color={color.rest} hover={{ color: color.hover }} wrap="truncate-end">
            {label}
          </Text>
        )}
        <Box position="absolute" top={0} left={0}>
          <Client key={hit} module="../press.tsx" width={cols} height={rows} props={{ id: hit, columns: cols, rows }} />
        </Box>
      </Box>
    )
  }
  return (
    <Box key={`face-${key}`} {...shape}>
      <Box position="absolute" top={0} bottom={0} left={0} right={props.isIconOnly ? 0 : undefined} paddingLeft={props.isIconOnly ? 0 : across(BUTTON.left)} flexDirection="row" alignItems="center" justifyContent={props.isIconOnly ? 'center' : undefined}>
        {art}
      </Box>
      <Box flexDirection="row" alignItems="center">
        <Box position="absolute" display="none" />
        <Button key={key} plain label={props.accessibleName} onPress={onPress} hover={{ backgroundColor: C.clear }}>
          <Text color={color.rest} weight="semibold">
            {props.isIconOnly ? spaces(BUTTON.height - 2 - 2 * PAD) : spaces(BUTTON.left + BUTTON.icon + BUTTON.gap - PAD) + label + spaces(BUTTON.right - PAD)}
          </Text>
        </Button>
      </Box>
    </Box>
  )
}
