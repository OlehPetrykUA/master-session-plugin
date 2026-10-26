import type { BoxProps, ButtonProps, ClientProps, ElementConstructor, SvgProps, TextProps } from 'claude-code'

import type { AgentRecord, ArchiveView, Asked, Board, Filter, Live, LiveSession, Repo, Running, SessionState, TaskText, Undone, WorkflowRecord } from '../../types'

import type { Row } from '../lib/rows'
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
  clear: (rows: readonly Row[], skipped: number) => void
  archive: (rows: readonly Row[], all?: { group: SessionState; skipped: number }, confirmed?: readonly string[]) => void
  undo: () => void
  stop: (id: string, name: string) => void
  unarchive: (one: LiveSession) => void
  open: (id: string, name: string) => void
  ask: () => void
  narrative: () => void
}

export type PaneData = {
  board: Board | null
  live: Live
  trees: readonly Repo[]
  rows: readonly Row[]
  archived: readonly LiveSession[]
  agents: readonly AgentRecord[]
  workflows: readonly WorkflowRecord[]
  running: Readonly<Record<string, Running>>
  tasks: Readonly<Record<string, TaskText>>
  totals: RunSummary
  chosen: Filter
  open: readonly string[]
  asking: string
  archiveView: ArchiveView
  asked: Asked | null
  undone: Undone | null
  cleared: number
  isClearing: boolean
  isRefreshing: boolean
  isNarrativeOpen: boolean
  at: number
  home: string
  columns: number
  offset: number
  bodyRows: number
  isAligned: boolean
  actions: Actions
}
