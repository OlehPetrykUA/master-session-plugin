import type { EngineInterface } from 'claude-code'

import type { Shared } from '../../types'
import { boardFromJson } from '../lib/board'
import { BOARD_MAX_AGE_MS, REPORT_CAP, accept, askText, capped } from './contract'
import type { Report } from './contract'

type Io = Pick<EngineInterface, 'fs'>

type Sender = Pick<EngineInterface, 'session' | 'mcp'>

export const stateDir = (home: string) => `${home}/.claude/state/master-session`

export const reportPath = (home: string, id: string) => `${stateDir(home)}/sessions/${id}.json`

export const boardPath = (home: string, masterId: string) => `${stateDir(home)}/boards/${masterId}.json`

const widthOf = (point: number) => (point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4)

export const bytesOf = (text: string) => [...text].reduce((sum, char) => sum + widthOf(char.codePointAt(0) ?? 0), 0)

const isEmpty = (report: Report) => !report.activity.length && !report.commits.length && !report.tests.length && !report.files.length && !report.agents?.length

export function reportJson(report: Report) {
  let next = capped(report)
  let text = JSON.stringify(next)
  while (bytesOf(text) > REPORT_CAP && !isEmpty(next)) {
    next = { ...next, activity: next.activity.slice(1), commits: next.commits.slice(1), tests: next.tests.slice(1), files: next.files.slice(1), agents: next.agents?.slice(1) }
    text = JSON.stringify(next)
  }
  return text
}

export function writeReport($: Io, home: string, report: Report) {
  return $.fs.write(reportPath(home, report.session), reportJson(report))
}

async function jsonOf($: Io, path: string) {
  return $.fs
    .read(path)
    .then(text => JSON.parse(text) as unknown)
    .catch(() => undefined)
}

export async function readReport($: Io, home: string, id: string) {
  return accept(undefined, await jsonOf($, reportPath(home, id)))
}

const seenReports = new Map<string, { mtimeMs: number; report?: Report }>()

const seenBoards = new Map<string, { mtimeMs: number; shared?: Shared }>()

export async function readReports($: Io, home: string) {
  const dir = `${stateDir(home)}/sessions`
  const entries = (await $.fs.list(dir).catch(() => [])).filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
  const paths = new Set(entries.map(entry => `${dir}/${entry.name}`))
  for (const path of [...seenReports.keys()]) {
    if (path.startsWith(`${dir}/`) && !paths.has(path)) seenReports.delete(path)
  }
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`
    const before = seenReports.get(path)
    if (before?.mtimeMs === entry.mtimeMs) continue
    const isOversize = entry.size > REPORT_CAP
    const raw = isOversize ? undefined : await jsonOf($, path)
    seenReports.set(path, { mtimeMs: raw === undefined && !isOversize ? -1 : entry.mtimeMs, report: accept(before?.report, raw) })
  }
  return [...seenReports].flatMap(([path, one]) => (path.startsWith(`${dir}/`) && one.report ? [one.report] : []))
}

export function writeBoard($: Io, home: string, shared: Shared) {
  return $.fs.write(boardPath(home, shared.masterId), JSON.stringify({ v: 1, kind: 'board', ...shared, board: { ...shared.board, source: undefined, since: undefined } }))
}

function sharedOf(raw: unknown): Shared | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const data = raw as Record<string, unknown>
  const board = boardFromJson(data.board, 'tool')
  if (data.kind !== 'board' || !board || typeof data.masterId !== 'string' || !Number.isFinite(data.at)) return undefined
  return { at: Number(data.at), masterId: data.masterId, masterTitle: typeof data.masterTitle === 'string' ? data.masterTitle : '', board }
}

export async function readBoard($: Io, home: string, masterId: string, now: number) {
  const path = boardPath(home, masterId)
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (!stat || stat.kind !== 'file') return undefined
  const before = seenBoards.get(path)
  if (before?.mtimeMs !== stat.mtimeMs) {
    const shared = sharedOf(await jsonOf($, path)) ?? before?.shared
    seenBoards.set(path, { mtimeMs: shared === before?.shared ? -1 : stat.mtimeMs, shared })
  }
  const shared = seenBoards.get(path)?.shared
  return shared && now - shared.at <= BOARD_MAX_AGE_MS ? shared : undefined
}

export async function parentFromBoards($: Io, home: string, self: string) {
  const dir = `${stateDir(home)}/boards`
  const entries = (await $.fs.list(dir).catch(() => [])).filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
  for (const entry of [...entries].sort((left, right) => right.mtimeMs - left.mtimeMs)) {
    const shared = sharedOf(await jsonOf($, `${dir}/${entry.name}`))
    if (shared && shared.masterId !== self && shared.board.sessions.some(one => one.id === self)) return shared.masterId
  }
  return ''
}

export async function askForUpdates($: Sender, targets: readonly { id: string; engineId: string }[], from: string, at: number) {
  const text = askText({ from, at })
  return Promise.all(
    targets.map(async target => {
      const sent = target.engineId ? await $.session.send({ to: { sessionId: target.engineId }, text }).catch(() => undefined) : undefined
      if (sent?.isDelivered) return { id: target.id, via: 'mod' as const }
      const isSent = await $.mcp
        .call('ccd_session_mgmt', 'send_message', { session_id: target.id, message: text })
        .then(result => !result.isError)
        .catch(() => false)
      return { id: target.id, via: isSent ? ('message' as const) : ('failed' as const) }
    }),
  )
}
