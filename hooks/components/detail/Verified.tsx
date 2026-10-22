import { across, down } from '../../lib/layout'
import { square } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { Quiet } from '../Quiet'
import type { Ui } from '../types'

export type VerifiedProps = { id: string; text: string }

export function Verified(ui: Ui, props: VerifiedProps) {
  const { Box, Text, Svg } = ui
  return (
    <Box key={`verified-${props.id}`} flexDirection="column" gap={down(4)} paddingX={across(12)} paddingY={down(10)} borderStyle="round" borderColor={C.clear} backgroundColor={C.inset}>
      <Box flexDirection="row" alignItems="center" gap={across(10)}>
        <Svg key={`verified-icon-${props.id}`} source={square('check', 'green', 'greenTint', 26, 8, 16)} alt="verified" width={26} height={26} />
        <Text weight="semibold">Verified</Text>
      </Box>
      {Quiet(ui, { text: props.text, isFull: true })}
    </Box>
  )
}
