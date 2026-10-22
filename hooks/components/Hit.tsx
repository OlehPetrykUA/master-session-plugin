import { bindPress } from '../data/presses'
import { CH, LH } from '../lib/layout'
import type { Ui } from './types'

export type HitProps = { id: string; width: number; height: number; onPress: () => void }

export function Hit(ui: Ui, props: HitProps) {
  const { Box, Client } = ui
  if (!Client) return null
  const key = `hit-${props.id}`
  const columns = Math.ceil(props.width / CH)
  const rows = Math.ceil(props.height / LH)
  bindPress(key, props.onPress)
  return (
    <Box position="absolute" top={0} left={0}>
      <Client key={key} module="./press.tsx" width={columns} height={rows} props={{ id: key, columns, rows }} />
    </Box>
  )
}
