import type { Block } from '../lib/list'
import { shownDots } from '../lib/list'
import type { TextUi } from './types'

export const perRowOf = (columns: number) => (columns >= 96 ? 4 : columns >= 60 ? 3 : 2)

const GAP = 2

const COLOR = { red: 'error', green: 'success', amber: 'warning', grey: undefined } as const

export const tileWidthOf = (columns: number) => Math.floor((columns - GAP * (perRowOf(columns) - 1)) / perRowOf(columns))

const joinOf = (sub: string, bad?: string) => (bad ? (sub ? `${sub} · ${bad}` : bad) : sub)

export function textSubOf(one: Block, room: number) {
  const subs = [one.sub, ...(one.shorts ?? [])]
  return subs.find(text => joinOf(text, one.bad).length <= room) ?? (one.bad ? '' : (subs.at(-1) ?? ''))
}

export function TextSummary(ui: TextUi, props: { blocks: readonly Block[]; columns: number }) {
  const { Box, Text } = ui
  const per = perRowOf(props.columns)
  const width = tileWidthOf(props.columns)
  const rows: Block[][] = []
  for (let index = 0; index < props.blocks.length; index += per) rows.push(props.blocks.slice(index, index + per))
  const tile = (one: Block) => {
    const dots = shownDots(one)
    const room = width - one.value.length - 1
    const chats = one.chats && dots.length ? ` · ${one.chats} sessions` : ''
    const dotsWidth = dots.reduce((sum, mark) => sum + 3 + String(mark.count).length, 0)
    const sub = one.dots ? '' : textSubOf(one, room)
    return (
      <Box key={`tile-${one.key}`} flexDirection="column" width={width}>
        <Text dimColor color={one.isAlert ? 'error' : undefined} weight={one.isAlert ? 'semibold' : undefined}>
          {one.label}
        </Text>
        <Box flexDirection="row" gap="xs">
          <Text weight="semibold">{one.value}</Text>
          {dots.map(mark => (
            <Text key={`tile-dot-${one.key}-${mark.tone}`} color={COLOR[mark.tone]} dimColor={mark.tone === 'grey' || undefined}>{`● ${mark.count}`}</Text>
          ))}
          {chats && dotsWidth + chats.length <= room ? <Text dimColor>{chats}</Text> : null}
          {sub ? <Text dimColor>{one.bad ? `${sub} · ` : sub}</Text> : null}
          {one.bad ? (
            <Text color="error" weight="semibold">
              {one.bad}
            </Text>
          ) : null}
        </Box>
      </Box>
    )
  }
  return (
    <Box key="section-summary" flexDirection="column" gap="xs">
      {rows.map((row, index) => (
        <Box key={`tiles-${index}`} flexDirection="row" gap="sm">
          {row.map(tile)}
        </Box>
      ))}
    </Box>
  )
}
