import type { RenderElement } from 'claude-code'

import { HIT } from '../../lib/band'
import type { BandAction } from '../../lib/band'
import { CH, LH, PAD, across, spaces, tall } from '../../lib/layout'
import { C, KINDS, LABEL_COLOR } from '../../theme/tokens'
import type { Kind } from '../../theme/tokens'
import type { Ui } from '../types'

export type BandButtonProps = { name: BandAction; label: string; art: RenderElement; onPress: () => void; kind: Kind; width: number; left: number; right: number }

export function BandButton(ui: Ui, props: BandButtonProps) {
  const { Box, Text, Button, Client } = ui
  const { name, label, art, onPress, kind, left, right } = props
  const one = KINDS[kind]
  const color = LABEL_COLOR[kind]
  const key = `band-${name}`
  const shape = {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    height: tall(36),
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
    const rows = Math.ceil(36 / LH)
    return (
      <Box key={`face-${key}`} {...shape} justifyContent="center" gap={across(6)} width={across(props.width)}>
        {art}
        <Text weight="semibold" color={color.rest} hover={{ color: color.hover }} wrap="truncate-end">
          {label}
        </Text>
        <Box position="absolute" top={0} left={0}>
          <Client key={hit} module="../press.tsx" width={cols} height={rows} props={{ id: hit, columns: cols, rows }} />
        </Box>
      </Box>
    )
  }
  return (
    <Box key={`face-${key}`} {...shape}>
      <Box position="absolute" top={0} bottom={0} left={0} paddingLeft={across(left)} flexDirection="row" alignItems="center">
        {art}
      </Box>
      <Box flexDirection="row" alignItems="center">
        <Box position="absolute" display="none" />
        <Button key={key} plain label={label} onPress={onPress} hover={{ backgroundColor: C.clear }}>
          <Text color={color.rest} weight="semibold">
            {spaces(left + 15 + 6 - PAD) + label + spaces(right - PAD)}
          </Text>
        </Button>
      </Box>
    </Box>
  )
}
