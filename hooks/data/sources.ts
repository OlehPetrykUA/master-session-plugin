import type { EngineInterface } from 'claude-code'

import type { Board, LiveSession, Repo, SessionState, Worktree } from '../../types'

import { lossesOf } from '../components/detail/losses'
import { bandProgress } from '../lib/band'
import { boardFromChat, boardFromJson } from '../lib/board'
import { BOARD_TOOL, PANE, TITLE, UNDO_MS } from '../lib/constants'
import { messageOf } from '../lib/format'
import { expandHome, locate, parseStatus, parseWorktrees } from '../lib/git'
import { itemsOf } from '../lib/list'
import { rowsOf } from '../lib/rows'
import type { Row } from '../lib/rows'
import { getAgents, getBoard, getLive, getReports, getRepos, getShared, getUndone, getWorkflows, saveBoard, saveLive, saveReports, saveRepos, saveShared, setAsked, setConfirming, setExpanded, setRefreshing, setUndone } from '../state/atoms'
import { BOARD_MAX_AGE_MS, askSummary, askTargets, isArchivable, merge } from './contract'
import { roleOf } from './recorder'
import { askForUpdates, readBoard, readReports, writeBoard } from './status'

let home = ''
let fileStamp = -1

export function startSources(value: string) {
  home = value
  fileStamp = -1
}

export function homeOf() {
  return home
}

export async function call($: EngineInterface, server: string, tool: string, args: Record<string, unknown>) {
  const result = await $.mcp.call(server, tool, args)
  const body = result.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('\n')
  if (result.isError) throw new Error(body || `${tool} failed`)
  return body
}

async function sessionOf($: EngineInterface, id: string) {
  return JSON.parse(await call($, 'ccd_session_mgmt', 'get_session', { session_id: id })) as Record<string, unknown>
}

export async function whoAmI($: EngineInterface) {
  const known = await getLive($)
  if (known.self) return known
  const me = await sessionOf($, 'self')
  const self = String(me.sessionId ?? '')
  const title = String(me.title ?? '')
  await saveLive($, prev => ({ ...prev, self, title }))
  return { ...known, self, title }
}

function statePath(self: string) {
  return self && home ? `${home}/.claude/state/master-session/${self}.json` : ''
}

export async function refreshFile($: EngineInterface) {
  const path = statePath((await getLive($)).self)
  const stat = path ? await $.fs.stat(path).catch(() => undefined) : undefined
  if (!stat || stat.kind !== 'file') {
    fileStamp = -1
    return false
  }
  if (stat.mtimeMs === fileStamp) return true
  fileStamp = stat.mtimeMs
  const next = boardFromJson(JSON.parse(await $.fs.read(path)), 'file')
  if (next) await saveBoard($, prev => ({ ...next, since: prev?.since ?? stat.mtimeMs }))
  return true
}

async function refreshTranscript($: EngineInterface) {
  const messages = await $.session.messages()
  for (const message of [...messages].reverse()) {
    if (message.role !== 'assistant') continue
    const used = [...message.toolUses].reverse().find(one => one.tool === BOARD_TOOL && !one.isError)
    const next = used ? boardFromJson(used.input, 'tool') : message.text.includes('🕐 **Tick') ? boardFromChat(message.text) : null
    if (next) {
      await saveBoard($, () => next)
      return
    }
  }
}

export async function refreshBoard($: EngineInterface) {
  if ((await getBoard($))?.source === 'tool') return
  if (!(await refreshFile($))) await refreshTranscript($)
}

export async function boardOf($: EngineInterface): Promise<{ board: Board | null; from: string }> {
  const own = await getBoard($)
  const at = await $.clock.now()
  const merged = merge(own, await getReports($), await getLive($), at)
  if (own || merged.sessions.length) return { board: merged, from: '' }
  const copy = await getShared($)
  return copy && at - copy.at <= BOARD_MAX_AGE_MS ? { board: copy.board, from: copy.masterTitle } : { board: null, from: '' }
}

export async function refreshShared($: EngineInterface) {
  if (await getBoard($)) return
  const { parent } = roleOf()
  const copy = parent ? await readBoard($, home, parent, await $.clock.now()) : undefined
  await saveShared($, () => copy ?? null)
}

export async function refreshReports($: EngineInterface) {
  const { role, self } = roleOf()
  if (role !== 'master') return
  const onBoard = new Set((await getBoard($))?.sessions.map(one => one.id))
  const mine = (await readReports($, home)).filter(one => one.parent === self || onBoard.has(one.session))
  await saveReports($, () => mine)
}

export async function publishBoard($: EngineInterface, board: Board, at: number) {
  const me = await getLive($)
  const masterId = me.self || roleOf().self
  if (masterId) await writeBoard($, home, { at, masterId, masterTitle: me.title || TITLE, board })
}

export async function askAll($: EngineInterface) {
  const me = await getLive($)
  const { board: current } = await boardOf($)
  const at = await $.clock.now()
  const ids = current?.sessions.map(one => one.id) ?? []
  const targets = askTargets(await getReports($), me, ids)
  const idle = me.sessions.filter(one => ids.includes(one.id) && !one.isRunning && !one.isArchived).length
  const sent = await askForUpdates($, targets, me.self || roleOf().self, at)
  const reached = sent.filter(one => one.via !== 'failed').length
  reached && (await setAsked($, { at, count: reached }))
  return askSummary(sent, idle)
}

async function refreshLive($: EngineInterface, isForced = false) {
  const at = await $.clock.now()
  try {
    const me = await whoAmI($)
    const known = new Map(me.sessions.map(one => [one.id, one]))
    const list = JSON.parse(
      await call($, 'ccd_session_mgmt', 'list_sessions', { linked: true, include_archived: true, limit: 50 }),
    ) as Record<string, unknown>[]
    const sessions = await Promise.all(
      list.map(async (row): Promise<LiveSession> => {
        const id = String(row.sessionId ?? '')
        const before = known.get(id)
        const facts = before?.createdAt !== undefined && before.model ? undefined : await sessionOf($, id).catch(() => ({}) as Record<string, unknown>)
        const createdAt = before?.createdAt ?? Date.parse(String(facts?.createdAt ?? ''))
        const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
        return {
          id,
          name: String(row.name ?? ''),
          title: String(row.title ?? ''),
          cwd: String(row.cwd ?? ''),
          isRunning: row.isRunning === true,
          isArchived: row.isArchived === true,
          lastActivityAt: row.isRunning === true ? 0 : Math.floor((Date.parse(String(row.lastActivityAt ?? '')) || 0) / 60_000) * 60_000,
          startedBy: text(row.startedBy),
          createdAt: Number.isNaN(createdAt) ? undefined : createdAt,
          model: text(facts?.model) ?? before?.model,
          effort: text(facts?.effort) ?? before?.effort,
          permissionMode: text(row.permissionMode) ?? before?.permissionMode ?? text(facts?.permissionMode),
        }
      }),
    )
    await saveLive($, prev => (!isForced && !prev.error && JSON.stringify(prev.sessions) === JSON.stringify(sessions) ? prev : { ...prev, sessions, error: '', at }))
  } catch (error) {
    await saveLive($, prev => (prev.error === messageOf(error) ? prev : { ...prev, error: messageOf(error), at }))
  }
}

export async function git($: EngineInterface, cwd: string, args: readonly string[]) {
  const ran = await $.process.run(['git', '--no-optional-locks', '-C', cwd, ...args], { timeoutMs: 10_000 })
  if (ran.exitCode !== 0) throw new Error(ran.stderr.trim() || `git ${args[0]} failed`)
  return ran.stdout
}

async function baseOf($: EngineInterface, path: string) {
  const remote = (await git($, path, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).catch(() => '')).trim()
  for (const name of [remote.replace(/^origin\//, ''), 'main', 'master'].filter(Boolean)) {
    if ((await git($, path, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]).catch(() => '')).trim()) return name
  }
  return undefined
}

async function treeOf($: EngineInterface, tree: ReturnType<typeof parseWorktrees>[number], base: string | undefined): Promise<Worktree> {
  const status = await git($, tree.path, ['status', '--porcelain=v2', '--branch']).catch(() => undefined)
  const count = !status ? '' : tree.isMain ? '0' : base ? (await git($, tree.path, ['rev-list', '--count', `refs/heads/${base}..HEAD`]).catch(() => '')).trim() : ''
  const known = status ? parseStatus(status) : { dirty: 0, paths: [], upstream: '', ahead: 0, behind: 0 }
  return { path: tree.path, branch: tree.branch, sha: tree.sha, isMain: tree.isMain, ...known, unmerged: /^\d+$/.test(count) ? Number(count) : undefined }
}

export async function repoOf($: EngineInterface, path: string): Promise<Repo | undefined> {
  const trees = parseWorktrees(await git($, path, ['worktree', 'list', '--porcelain']))
  const main = trees.find(tree => tree.isMain) ?? trees[0]
  if (!main) return undefined
  const base = await baseOf($, path)
  const worktrees = await Promise.all(trees.map(tree => treeOf($, tree, base)))
  const refs = await git($, path, ['for-each-ref', 'refs/heads', '--format=x%(upstream:short)']).catch(() => '')
  return {
    path: main.path,
    name: home && main.path.startsWith(`${home}/`) ? `~${main.path.slice(home.length)}` : main.path,
    localOnly: refs.split('\n').filter(line => line === 'x').length,
    base,
    worktrees,
  }
}

async function refreshRepos($: EngineInterface) {
  const { board: current } = await boardOf($)
  const rows = rowsOf(current, await getLive($))
  const paths = [
    ...rows.flatMap(row => [row.board?.cwd ?? '', row.live?.cwd ?? ''].filter(Boolean)),
    ...(current?.repos ?? []).map(path => expandHome(path, home)),
    ...(current?.sessions ?? []).flatMap(one => (one.worktrees ?? []).map(path => expandHome(path, home))),
  ].filter(path => path.startsWith('/'))
  const found = new Map<string, Repo>()
  for (const path of new Set(paths)) {
    if (locate(path, [...found.values()])) continue
    const repo = await repoOf($, path).catch(() => undefined)
    if (repo) found.set(repo.path, repo)
  }
  await saveRepos($, () => [...found.values()])
}

export async function isPaneOpen($: EngineInterface) {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

export async function refreshAll($: EngineInterface, isForced = false) {
  if (!isForced && !(await boardOf($)).board && !(await isPaneOpen($))) return
  isForced && (await setRefreshing($, true))
  try {
    await refreshLive($, isForced)
    await refreshRepos($)
  } finally {
    isForced && (await setRefreshing($, false))
  }
}

export async function openPane($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true })
  void refreshAll($, true).catch(() => undefined)
  return opened.isPlaced
}

export async function openSession($: EngineInterface, id: string, name: string) {
  try {
    await call($, 'ccd_window', 'open_session_in', { session_id: id, target: 'focus' })
  } catch (error) {
    $.ui.toast(`Couldn't open ${name}: ${messageOf(error)}`)
  }
}

export async function openSummary($: EngineInterface) {
  await openPane($)
}

export async function openAsking($: EngineInterface) {
  const { board: current } = await boardOf($)
  const id = bandProgress(current, await getLive($))?.segments.find(one => one.state === 'needs-you')?.id
  const asking = current?.sessions.find(one => one.id === id)
  if (asking) await openSession($, asking.id, asking.name)
}

async function archiveOne($: EngineInterface, id: string, name: string) {
  await call($, 'ccd_session_mgmt', 'archive_session', { session_id: id, reason: 'Archived from the master session pane' })
  await refreshLive($)
  const after = (await getLive($)).sessions.find(one => one.id === id)
  if (after && !after.isArchived) throw new Error(`${name} is still active. The app may be waiting for your approval.`)
}

export async function archive($: EngineInterface, rows: readonly Row[], all?: { group: SessionState; skipped: number }, confirmed: readonly string[] = []) {
  await setConfirming($, '')
  await refreshLive($).catch(() => undefined)
  await refreshRepos($).catch(() => undefined)
  const trees = await getRepos($)
  const fresh = rowsOf((await boardOf($)).board, await getLive($))
  const targets = rows.flatMap(row => fresh.filter(one => one.id === row.id))
  const allowed = targets.filter(row => isArchivable(row.board ?? { state: row.state }, row.live))
  const refused = rows.filter(row => !allowed.some(one => one.id === row.id)).map(row => row.name)
  if (refused.length) $.ui.toast(`Not archived: ${refused.join(', ')} ${refused.length === 1 ? 'is' : 'are'} still working or waiting for your answer.`)
  const first = allowed[0]
  if (!all && first && JSON.stringify(lossesOf(first, trees)) !== JSON.stringify(confirmed)) {
    await setExpanded($, () => [first.id])
    await setConfirming($, `archive:${first.id}`)
    return
  }
  const clean = all ? allowed.filter(row => !lossesOf(row, trees).length) : allowed
  const items = itemsOf(fresh, await getAgents($), await getWorkflows($))
  const archived: Row[] = []
  for (const row of clean) {
    try {
      await archiveOne($, row.id, row.name)
      archived.push(row)
    } catch (error) {
      $.ui.toast(`Not archived: ${messageOf(error)}`)
      break
    }
  }
  await setExpanded($, open => open.filter(id => !archived.some(row => row.id === id)))
  const group = all?.group ?? archived[0]?.state
  const skipped = all ? all.skipped + allowed.length - clean.length : 0
  if (!group || (!archived.length && !skipped)) return
  const at = await $.clock.now()
  const index = all || !archived[0] ? 0 : Math.max(0, items.filter(item => item.group === group).findIndex(item => item.id === archived[0]?.id))
  await setUndone($, () => ({ ids: archived.map(row => row.id), name: !all && archived[0] ? archived[0].name : '', skipped, group, index, at }))
  $.clock.after(UNDO_MS, () => void setUndone($, value => (value?.at === at ? null : value)))
}

export async function undoArchive($: EngineInterface) {
  const undone = await getUndone($)
  await setUndone($, () => null)
  try {
    for (const id of undone?.ids ?? []) await call($, 'ccd_session_mgmt', 'unarchive_session', { session_id: id })
  } catch (error) {
    $.ui.toast(`Not unarchived: ${messageOf(error)}`)
  }
  await refreshLive($).catch(() => undefined)
}

export async function stopSession($: EngineInterface, id: string, name: string) {
  try {
    await call($, 'ccd_session_mgmt', 'stop_session', { session_id: id })
  } catch (error) {
    $.ui.toast(`Couldn't stop ${name}: ${messageOf(error)}`)
  }
  await refreshLive($).catch(() => undefined)
}

export async function unarchive($: EngineInterface, one: LiveSession) {
  await setConfirming($, '')
  const name = one.name || one.title
  try {
    await call($, 'ccd_session_mgmt', 'unarchive_session', { session_id: one.id })
    await refreshLive($)
    $.ui.toast(`Unarchived ${name}.`)
  } catch (error) {
    $.ui.toast(`Not unarchived: ${messageOf(error)}`)
  }
}
