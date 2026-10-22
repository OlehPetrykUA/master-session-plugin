import type { BoxProps, ButtonProps, ClientProps, ElementConstructor, SvgProps, TextProps } from 'claude-code'

import type { Board, Filter, Live, LiveSession, Repo } from '../../types'

import type { Counts, Row } from '../lib/rows'

export type TextUi = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export type Ui = TextUi & { Svg: ElementConstructor<SvgProps>; Client?: ElementConstructor<ClientProps> }

export type Actions = {
  refresh: () => void
  showBoard: (isBoard: boolean) => void
  filter: (id: Filter) => void
  toggle: (id: string) => void
  collapse: (id: string) => void
  confirm: (what: string) => void
  archive: (rows: readonly Row[]) => void
  unarchive: (one: LiveSession) => void
  open: (id: string, name: string) => void
  ask: () => void
}

export type PaneData = {
  board: Board | null
  from: string
  live: Live
  trees: readonly Repo[]
  rows: readonly Row[]
  archived: readonly LiveSession[]
  counts: Counts
  chosen: Filter
  open: readonly string[]
  asking: string
  isBoardForced: boolean
  at: number
  home: string
  columns: number
  offset: number
  bodyRows: number
  isAligned: boolean
  actions: Actions
}
