import type { BoxProps, ButtonProps, ClientProps, ElementConstructor, SvgProps, TextProps } from 'claude-code'

import type { AgentRecord, ArchiveView, Asked, Board, Filter, Live, LiveSession, Repo, Undone, WorkflowRecord } from '../../types'

import type { Counts, Row } from '../lib/rows'
import type { RunSummary } from '../lib/totals'

export type TextUi = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export type Ui = TextUi & { Svg: ElementConstructor<SvgProps>; Client?: ElementConstructor<ClientProps> }

export type Actions = {
  refresh: () => void
  archiveView: (value: ArchiveView) => void
  filter: (id: Filter) => void
  toggle: (id: string) => void
  collapse: (id: string) => void
  confirm: (what: string) => void
  archive: (rows: readonly Row[], skipped?: number) => void
  undo: () => void
  stop: (id: string, name: string) => void
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
  agents: readonly AgentRecord[]
  workflows: readonly WorkflowRecord[]
  totals: RunSummary
  counts: Counts
  chosen: Filter
  open: readonly string[]
  asking: string
  archiveView: ArchiveView
  asked: Asked | null
  undone: Undone | null
  isRefreshing: boolean
  at: number
  home: string
  columns: number
  offset: number
  bodyRows: number
  isAligned: boolean
  actions: Actions
}
