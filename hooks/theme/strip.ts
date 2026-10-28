const HEIGHT = 6
const FLOOR = 10
const RUN_MIN = 16

const LIGHT = '--track:rgba(31,30,29,0.10);--grey:#87867F;--green:#3F7A35;--red:#C2413B'
const DARK = '--track:rgba(250,249,245,0.12);--grey:#9C9A92;--green:#7BC46A;--red:#F06A60'

export type BarTone = 'grey' | 'green' | 'red'

type BarInput = { width: number; overall: number; tone: BarTone; isSliding: boolean }

const n = (value: number) => value.toFixed(1)

const capsule = (x: number, width: number) => {
  const radius = HEIGHT / 2
  const length = Math.max(width, HEIGHT)
  return `M${n(x + radius)},0h${n(length - HEIGHT)}a${radius},${radius} 0 0 1 0,${HEIGHT}h${n(HEIGHT - length)}a${radius},${radius} 0 0 1 0,-${HEIGHT}Z`
}

const fillOf = (width: number, overall: number, isSliding = false) => (isSliding ? Math.min(width, Math.max(RUN_MIN, overall * width)) : overall > 0 ? Math.min(width, Math.max(FLOOR, overall * width)) : 0)

export function strip({ width, overall, tone, isSliding }: BarInput) {
  const room = Math.round(width)
  const fill = fillOf(room, overall, isSliding)
  const body =
    `<path d="${capsule(0, room)}" style="fill:var(--track)"/>` +
    (fill > 0 ? `<path d="${capsule(0, fill)}" style="fill:var(--${tone})"/>` : '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="${HEIGHT}" viewBox="0 0 ${room} ${HEIGHT}" preserveAspectRatio="none"><style>svg{${LIGHT}}@media (prefers-color-scheme: dark){svg{${DARK}}}</style>${body}</svg>`
}
