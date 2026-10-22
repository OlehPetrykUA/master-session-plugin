import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { AgentRecord, ArchiveView, Asked, Board, Filter, Live, Repo, Report, Shared, Undone, WorkflowRecord } from '../../types'

const board = atom({ plugin: 'master-session', key: 'board' } as const, null)
const live = atom({ plugin: 'master-session', key: 'live' } as const, { self: '', title: '', sessions: [], error: '', at: 0 })
const repos = atom({ plugin: 'master-session', key: 'repos' } as const, [])
const expanded = atom({ plugin: 'master-session', key: 'expanded' } as const, [])
const confirming = atom({ plugin: 'master-session', key: 'confirming' } as const, '')
const filter = atom({ plugin: 'master-session', key: 'filter' } as const, 'all')
const archiveView = atom({ plugin: 'master-session', key: 'archiveView' } as const, 'closed')
const asked = atom({ plugin: 'master-session', key: 'asked' } as const, null)
const undone = atom({ plugin: 'master-session', key: 'undone' } as const, null)
const isRefreshing = atom({ plugin: 'master-session', key: 'isRefreshing' } as const, false)
const shared = atom({ plugin: 'master-session', key: 'shared' } as const, null)
const reports = atom({ plugin: 'master-session', key: 'reports' } as const, [])
const agents = atom({ plugin: 'master-session', key: 'agents' } as const, [])
const workflows = atom({ plugin: 'master-session', key: 'workflows' } as const, [])

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

export function getArchiveView($: EngineInterface) {
  return read($, archiveView)
}

export function setArchiveView($: EngineInterface, value: ArchiveView) {
  return update($, archiveView, () => value)
}

export function getAsked($: EngineInterface) {
  return read($, asked)
}

export function setAsked($: EngineInterface, value: Asked | null) {
  return update($, asked, () => value)
}

export function getUndone($: EngineInterface) {
  return read($, undone)
}

export function setUndone($: EngineInterface, change: (value: Undone | null) => Undone | null) {
  return update($, undone, change)
}

export function getRefreshing($: EngineInterface) {
  return read($, isRefreshing)
}

export function setRefreshing($: EngineInterface, value: boolean) {
  return update($, isRefreshing, () => value)
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

export function getAgents($: EngineInterface) {
  return read($, agents)
}

export async function saveAgents($: EngineInterface, change: (value: AgentRecord[]) => AgentRecord[]) {
  const before = await read($, agents)
  if (!isSame(change(before), before)) await update($, agents, change)
}

export function getWorkflows($: EngineInterface) {
  return read($, workflows)
}

export async function saveWorkflows($: EngineInterface, change: (value: WorkflowRecord[]) => WorkflowRecord[]) {
  const before = await read($, workflows)
  if (!isSame(change(before), before)) await update($, workflows, change)
}
