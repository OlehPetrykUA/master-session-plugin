import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Board, Filter, Live, Repo, Report, Shared } from '../../types'

const board = atom({ plugin: 'master-session', key: 'board' } as const, null)
const live = atom({ plugin: 'master-session', key: 'live' } as const, { self: '', title: '', sessions: [], error: '', at: 0 })
const repos = atom({ plugin: 'master-session', key: 'repos' } as const, [])
const expanded = atom({ plugin: 'master-session', key: 'expanded' } as const, [])
const confirming = atom({ plugin: 'master-session', key: 'confirming' } as const, '')
const filter = atom({ plugin: 'master-session', key: 'filter' } as const, 'all')
const isSummaryHidden = atom({ plugin: 'master-session', key: 'isSummaryHidden' } as const, false)
const shared = atom({ plugin: 'master-session', key: 'shared' } as const, null)
const reports = atom({ plugin: 'master-session', key: 'reports' } as const, [])

const isSame = (one: unknown, other: unknown) => JSON.stringify(one) === JSON.stringify(other)

export function getBoard($: EngineInterface) {
  return read($, board)
}

export async function saveBoard($: EngineInterface, change: (value: Board | null) => Board | null) {
  const before = await read($, board)
  if (!isSame(change(before), before)) await update($, board, change)
}

export function getLive($: EngineInterface) {
  return read($, live)
}

export async function saveLive($: EngineInterface, change: (value: Live) => Live) {
  const before = await read($, live)
  if (!isSame(change(before), before)) await update($, live, change)
}

export function getRepos($: EngineInterface) {
  return read($, repos)
}

export async function saveRepos($: EngineInterface, change: (value: Repo[]) => Repo[]) {
  const before = await read($, repos)
  if (!isSame(change(before), before)) await update($, repos, change)
}

export function idsOf(value: unknown) {
  if (Array.isArray(value)) return value.filter((one): one is string => typeof one === 'string')
  return typeof value === 'string' && value ? [value] : []
}

export async function getExpanded($: EngineInterface) {
  return idsOf(await read($, expanded)).slice(-1)
}

export function setExpanded($: EngineInterface, change: (value: string[]) => string[]) {
  return update($, expanded, value => change(idsOf(value).slice(-1)))
}

export function getConfirming($: EngineInterface) {
  return read($, confirming)
}

export function setConfirming($: EngineInterface, value: string) {
  return update($, confirming, () => value)
}

export function getFilter($: EngineInterface) {
  return read($, filter)
}

export function setFilter($: EngineInterface, value: Filter) {
  return update($, filter, () => value)
}

export function getSummaryHidden($: EngineInterface) {
  return read($, isSummaryHidden)
}

export function setSummaryHidden($: EngineInterface, value: boolean) {
  return update($, isSummaryHidden, () => value)
}

export function getShared($: EngineInterface) {
  return read($, shared)
}

export async function saveShared($: EngineInterface, change: (value: Shared | null) => Shared | null) {
  const before = await read($, shared)
  if (!isSame(change(before), before)) await update($, shared, change)
}

export function getReports($: EngineInterface) {
  return read($, reports)
}

export async function saveReports($: EngineInterface, change: (value: Report[]) => Report[]) {
  const before = await read($, reports)
  if (!isSame(change(before), before)) await update($, reports, change)
}
