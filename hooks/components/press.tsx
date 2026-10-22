import type { ClientModule } from 'claude-code'

type Props = { id: string; columns: number; rows: number }

const held = new Set<string>()

const Press: ClientModule<Props> = (props, surface) => {
  surface.onPointer(event => {
    if (event.type === 'down' && event.button === 'left') held.add(props.id)
    if (event.type !== 'up') return
    const isInside = event.x >= 0 && event.y >= 0 && event.x <= Math.max(props.columns, surface.columns) && event.y <= Math.max(props.rows, surface.rows)
    if (held.has(props.id) && isInside) surface.post({ press: props.id })
    held.delete(props.id)
  })
  surface.onKey(event => {
    if (event.key === 'return' || event.key === 'space' || event.key === ' ') surface.post({ press: props.id })
  })
  const { Box } = surface.elements
  return <Box width="100%" height={props.rows} />
}

export default Press
