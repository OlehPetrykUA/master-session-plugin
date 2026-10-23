import type { EngineInterface } from 'claude-code'

import type { Board, LiveSession, Repo, SessionState, Worktree } from '../../types'

import { lossesOf, sideOf } from '../components/detail/losses'
import { withReported, withReportedRuns } from '../lib/agents'
import { agentCountsOf, askingChatOf } from '../lib/band'
import { boardFromChat, boardFromJson } from '../lib/board'
import { ARCHIVE_LIMIT, BOARD_TOOL, GIT_CAP, LIVE_LIMIT, PANE, TITLE, TREE_STALE_MS, UNDO_MS } from '../lib/constants'
import { messageOf } from '../lib/format'
import { expandHome, locate, parseStatus, parseWorktrees } from '../lib/git'
import { itemsOf } from '../lib/list'
import { runStartOf } from '../lib/totals'
import { familyOf, rowsOf } from '../lib/rows'
import type { Row } from '../lib/rows'
import { getAgents, getBoard, getLive, getReports, getRepos, getUndone, getWorkflows, saveAgents, saveBoard, saveWorkflows, saveLive, saveReports, saveRepos, setAsked, setConfirming, setExpanded, setRefreshing, setUndone } from '../state/atoms'
import { BOARD_MAX_AGE_MS, askSummary, askTargets, isArchivable, liveReportsOf, merge } from './contract'
import { keptAgents } from './agents'
import { detected, roleOf } from './recorder'
import { askForUpdates, readReports, writeBoard } from './status'

let home = ''
let fileStamp = -1
let published = ''
let publishedAt = 0
let flight: Promise<void> | undefined
let isQueued = false
const seenTrees = new Map<string, { key: string; at: number; tree: Worktree }>()
const seenRepos = new Map<string, { key: string; at: number; base: string | undefined; localOnly: number; landed: number }>()
const gitDirs = new Map<string, string>()

export function startSources(value: string) {
  home = value
  fileStamp = -1
  published = ''
  publishedAt = 0
  flight = undefined
  isQueued = false
  seenTrees.clear()
  titles.clear()
  seenRepos.clear()
  gitDirs.clear()
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

export async function boardOf($: EngineInterface): Promise<{ board: Board | null }> {
  const own = await getBoard($)
  const at = await $.clock.now()
  return { board: own ? merge(own, await getReports($), await getLive($), at) : null }
}

export async function refreshReports($: EngineInterface) {
  const { self } = roleOf()
  if (!self) return
  const onBoard = new Set((await getBoard($))?.sessions.map(one => one.id))
  const mine = liveReportsOf((await readReports($, home)).filter(one => one.parent === self || onBoard.has(one.session)), await getLive($))
  await saveReports($, () => mine)
  const now = await $.clock.now()
  await saveWorkflows($, workflows => withReportedRuns(workflows, mine))
  const workflows = await getWorkflows($)
  await saveAgents($, agents => keptAgents(withReported(agents, mine), workflows, now))
  await republishBoard($)
}

export async function republishBoard($: EngineInterface) {
  const own = await getBoard($)
  const me = await getLive($)
  const masterId = me.self || roleOf().self
  if (!own || !masterId) return
  const at = await $.clock.now()
  const merged = merge(own, await getReports($), me, at)
  const repos = [...new Set([...merged.repos, ...(await getRepos($)).map(one => one.path)])]
  const sign = JSON.stringify([merged.sessions.map(one => [one.id, one.name, one.state, one.progress, one.now, one.next, one.needsYou, one.commits?.length, one.tests?.length]), merged.needsYou, repos])
  if (sign === published && at - publishedAt < BOARD_MAX_AGE_MS / 3) return
  published = sign
  publishedAt = at
  await writeBoard($, home, { at, masterId, board: { ...merged, repos } })
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

async function listSessions($: EngineInterface, known: readonly LiveSession[], args: { include_archived: boolean; limit: number }, hasFacts = true) {
  const before = new Map(known.map(one => [one.id, one]))
  const list = JSON.parse(await call($, 'ccd_session_mgmt', 'list_sessions', { linked: true, ...args })) as Record<string, unknown>[]
  return Promise.all(
    list.map(async (row): Promise<LiveSession> => {
      const id = String(row.sessionId ?? '')
      const seen = before.get(id)
      const facts = !hasFacts || (seen?.createdAt !== undefined && seen.model) ? undefined : await sessionOf($, id).catch(() => ({}) as Record<string, unknown>)
      const createdAt = seen?.createdAt ?? Date.parse(String(facts?.createdAt ?? ''))
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
        model: text(facts?.model) ?? seen?.model,
        effort: text(facts?.effort) ?? seen?.effort,
        permissionMode: text(row.permissionMode) ?? seen?.permissionMode ?? text(facts?.permissionMode),
      }
    }),
  )
}

async function refreshLive($: EngineInterface, isForced = false) {
  const at = await $.clock.now()
  try {
    const me = await whoAmI($)
    const sessions = await listSessions($, me.sessions, { include_archived: true, limit: LIVE_LIMIT })
    await saveLive($, prev => (!isForced && !prev.error && JSON.stringify(prev.sessions) === JSON.stringify(sessions) ? prev : { ...prev, sessions, error: '', at }))
  } catch (error) {
    await saveLive($, prev => (prev.error === messageOf(error) ? prev : { ...prev, error: messageOf(error), at }))
  }
}

type Tick = { spent: number; isForced: boolean }

class Capped extends Error {}

const isOut = (tick: Tick) => !tick.isForced && tick.spent >= GIT_CAP

const soft =
  <T,>(fallback: T) =>
  (error: unknown) => {
    if (error instanceof Capped) throw error
    return fallback
  }

export async function git($: EngineInterface, cwd: string, args: readonly string[], tick: Tick) {
  if (isOut(tick)) throw new Capped('git cap')
  tick.spent += 1
  const ran = await $.process.run(['git', '--no-optional-locks', '-C', cwd, ...args], { timeoutMs: 10_000 })
  if (ran.exitCode !== 0) throw new Error(ran.stderr.trim() || `git ${args[0]} failed`)
  return ran.stdout
}

async function baseOf($: EngineInterface, path: string, tick: Tick) {
  const remote = (await git($, path, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], tick).catch(soft(''))).trim()
  for (const name of [remote.replace(/^origin\//, ''), 'main', 'master'].filter(Boolean)) {
    if ((await git($, path, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], tick).catch(soft(''))).trim()) return name
  }
  return undefined
}

async function gitDirOf($: EngineInterface, path: string) {
  const known = gitDirs.get(path)
  if (known) return known
  const pointer = /^gitdir: (.+)$/m.exec(await $.fs.read(`${path}/.git`).catch(() => ''))?.[1]?.trim()
  const dir = pointer ? (pointer.startsWith('/') ? pointer : `${path}/${pointer}`) : `${path}/.git`
  gitDirs.set(path, dir)
  return dir
}

async function keyOf($: EngineInterface, tree: ReturnType<typeof parseWorktrees>[number], base: string | undefined) {
  const index = await $.fs.stat(`${await gitDirOf($, tree.path)}/index`).catch(() => undefined)
  return index ? `${tree.sha}|${tree.branch}|${base ?? ''}|${index.mtimeMs}|${index.size}` : ''
}

async function treeOf($: EngineInterface, tree: ReturnType<typeof parseWorktrees>[number], base: string | undefined, tick: Tick, now: number): Promise<Worktree> {
  const key = await keyOf($, tree, base)
  const before = seenTrees.get(tree.path)
  if (!tick.isForced && key && before?.key === key && now - before.at < TREE_STALE_MS) return before.tree
  if (!tick.isForced && tick.spent + (tree.isMain ? 1 : 2) > GIT_CAP) return before?.tree ?? { path: tree.path, branch: tree.branch, sha: tree.sha, isMain: tree.isMain, dirty: 0, paths: [], upstream: '', ahead: 0, behind: 0 }
  const status = await git($, tree.path, ['status', '--porcelain=v2', '--branch', '--untracked-files=all', '--ignore-submodules=none'], tick).catch(soft(undefined))
  const count = !status ? '' : tree.isMain ? '0' : base ? (await git($, tree.path, ['rev-list', '--count', `refs/heads/${base}..HEAD`], tick).catch(soft(''))).trim() : ''
  const known = status ? parseStatus(status) : { dirty: 0, paths: [], upstream: '', ahead: 0, behind: 0 }
  const scanned = { path: tree.path, branch: tree.branch, sha: tree.sha, isMain: tree.isMain, ...known, unmerged: /^\d+$/.test(count) ? Number(count) : undefined }
  if (status !== undefined) seenTrees.set(tree.path, { key, at: now, tree: scanned })
  return scanned
}

async function factsOf($: EngineInterface, path: string, tick: Tick, key: string, at: number, start: number) {
  const base = await baseOf($, path, tick)
  const localOnly = (await git($, path, ['for-each-ref', 'refs/heads', '--format=x%(upstream:short)'], tick).catch(soft(''))).split('\n').filter(line => line === 'x').length
  const landed = base ? Number((await git($, path, ['rev-list', '--count', `--since=${new Date(start).toISOString()}`, `refs/heads/${base}`], tick).catch(soft('0'))).trim()) || 0 : 0
  return { key, at, base, localOnly, landed }
}

export async function repoOf($: EngineInterface, path: string, tick: Tick, start: number): Promise<Repo | undefined> {
  const listing = await git($, path, ['worktree', 'list', '--porcelain'], tick)
  const trees = parseWorktrees(listing)
  const main = trees.find(tree => tree.isMain) ?? trees[0]
  if (!main) return undefined
  const now = await $.clock.now()
  const seen = seenRepos.get(main.path)
  const facts = !tick.isForced && seen && seen.key === listing && now - seen.at < TREE_STALE_MS ? seen : await factsOf($, path, tick, listing, now, start)
  seenRepos.set(main.path, facts)
  const worktrees: Worktree[] = []
  for (const tree of trees) worktrees.push(await treeOf($, tree, facts.base, tick, now))
  return {
    path: main.path,
    name: home && main.path.startsWith(`${home}/`) ? `~${main.path.slice(home.length)}` : main.path,
    localOnly: facts.localOnly,
    base: facts.base,
    landed: facts.landed,
    worktrees,
  }
}

const ancestry = new Map<string, { isOn: boolean; head: string }>()

async function provenOf($: EngineInterface, repos: Repo[], rows: readonly Row[], tick: Tick) {
  const proven = new Map<string, Set<string>>()
  const heads = new Map<string, string>()
  const seen = new Set<string>()
  for (const row of rows) {
    const sha = row.board?.sha ?? ''
    const cwd = row.live?.cwd ?? row.board?.cwd
    const found = cwd ? locate(cwd, repos) : undefined
    if (!found?.repo.base || !found.tree.isMain || !/^[0-9a-f]{7,40}$/i.test(sha)) continue
    const { path, base } = found.repo
    const key = `${path}\0${base}\0${sha}`
    if (seen.has(key)) continue
    seen.add(key)
    let known = ancestry.get(key)
    if (!known?.isOn && (tick.isForced || tick.spent + 2 <= GIT_CAP)) {
      if (!heads.has(path)) heads.set(path, (await git($, path, ['rev-parse', `refs/heads/${base}`], tick).catch(soft(''))).trim())
      const head = heads.get(path) as string
      if (!known || known.head !== head) {
        const isOn = await git($, path, ['merge-base', '--is-ancestor', sha, `refs/heads/${base}`], tick).then(() => true, soft(false))
        known = { isOn, head }
        ancestry.set(key, known)
      }
    }
    if (known?.isOn) proven.set(path, (proven.get(path) ?? new Set()).add(sha))
  }
  return repos.map(repo => (proven.has(repo.path) ? { ...repo, onBase: [...(proven.get(repo.path) as Set<string>)] } : repo))
}

async function refreshRepos($: EngineInterface, sessions?: readonly LiveSession[], isForced = false) {
  const tick: Tick = { spent: 0, isForced }
  const prior = await getRepos($)
  const { board: current } = await boardOf($)
  const live = await getLive($)
  const rows = rowsOf(current, live)
  const start = runStartOf(rows, await getAgents($), current, await $.clock.now())
  const paths = [
    ...rows.flatMap(row => [row.board?.cwd ?? '', row.live?.cwd ?? ''].filter(Boolean)),
    ...rows.flatMap(row => sideOf(row, sessions ?? familyOf(live), [])).map(one => one.cwd),
    ...(current?.repos ?? []).map(path => expandHome(path, home)),
    ...(current?.sessions ?? []).flatMap(one => (one.worktrees ?? []).map(path => expandHome(path, home))),
  ].filter(path => path.startsWith('/'))
  const found = new Map<string, Repo>()
  const failed: string[] = []
  for (const path of new Set(paths)) {
    if ([...found.values()].some(repo => repo.worktrees.some(tree => tree.path === path))) continue
    try {
      const repo = await repoOf($, path, tick, start)
      if (repo) found.set(repo.path, repo)
      else failed.push(path)
    } catch (error) {
      const old = error instanceof Capped ? locate(path, prior) : undefined
      if (old) found.set(old.repo.path, old.repo)
      else if (!(error instanceof Capped)) failed.push(path)
    }
  }
  for (const path of failed) {
    const outer = locate(path, [...found.values()])
    if (outer && outer.tree.path !== path) found.set(outer.repo.path, { ...outer.repo, worktrees: [...outer.repo.worktrees, { path, branch: '', sha: '', isMain: false, dirty: 0, paths: [], upstream: '', ahead: 0, behind: 0 }] })
  }
  const repos = await provenOf($, [...found.values()], rows, tick)
  await saveRepos($, () => repos)
  return repos
}

export async function isPaneOpen($: EngineInterface) {
  return (await $.ui.panes()).some(pane => pane.id === PANE && pane.isShown && pane.isPlaced)
}

let traced: string[] = []

export async function tracePane($: EngineInterface, what: string) {
  if (!home || (await $.env.get('MASTER_SESSION_TRACE_PANE').catch(() => undefined)) !== '1') return
  const panes = JSON.stringify(await $.ui.panes().catch(() => []))
  traced = [...traced, `${await $.clock.now()} ${what} panes=${panes}`].slice(-300)
  await $.fs.write(`${home}/.claude/state/master-session/pane-trace.log`, traced.join('\n')).catch(() => undefined)
}

export async function isMaster($: EngineInterface) {
  return !!(await getBoard($))
}

export async function isWorker($: EngineInterface) {
  return roleOf().role === 'worker' && !(await isMaster($))
}

async function scan($: EngineInterface, isForced: boolean) {
  isForced && (await setRefreshing($, true))
  try {
    await refreshLive($, isForced)
    await refreshRepos($, undefined, isForced)
    await republishBoard($)
  } finally {
    isForced && (await setRefreshing($, false))
  }
}

export async function refreshAll($: EngineInterface, isForced = false) {
  if (!isForced && !(await isMaster($))) return
  if (flight) {
    isQueued ||= isForced
    return flight
  }
  flight = (async () => {
    await scan($, isForced)
    while (isQueued) {
      isQueued = false
      await scan($, true)
    }
  })().finally(() => {
    flight = undefined
    isQueued = false
  })
  return flight
}

export async function markMaster($: EngineInterface) {
  const at = await $.clock.now()
  await saveBoard($, prev => prev ?? { sessions: [], needsYou: [], repos: [], source: 'tool', since: at, at })
}

const titles = new Map<string, string>()

export async function workerNote($: EngineInterface) {
  await detected($)
  const { parent } = roleOf()
  if (!(await isWorker($))) return ''
  const title = titles.get(parent) ?? String((await sessionOf($, parent).catch(() => ({}) as Record<string, unknown>)).title ?? '')
  if (title) titles.set(parent, title)
  return `This is a worker session of ${title ? `"${title}" (${parent})` : parent}: the master session pane is only in that session.`
}

export async function openPane($: EngineInterface, caller = '') {
  if (await isWorker($)) return false
  await tracePane($, `openPane caller=${caller}`)
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
  const agents = agentCountsOf(await getAgents($), await getWorkflows($))
  const chat = askingChatOf(current, await getLive($), agents, await getRepos($))
  if (chat) await openSession($, chat.id, chat.name)
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
  const live = await getLive($)
  if (live.error) {
    $.ui.toast(`Not archived: ${live.error}`)
    return
  }
  const sessions = await listSessions($, live.sessions, { include_archived: true, limit: ARCHIVE_LIMIT }, false).catch((error: unknown) => messageOf(error))
  if (typeof sessions === 'string') {
    $.ui.toast(`Not archived: ${sessions}`)
    return
  }
  await saveLive($, prev => ({ ...prev, family: sessions }))
  const trees = await refreshRepos($, sessions, true).catch(() => [] as Repo[])
  const fresh = rowsOf((await boardOf($)).board, live)
  const targets = rows.flatMap(row => fresh.filter(one => one.id === row.id))
  const busyOf = (row: Row) => sideOf(row, sessions, trees).find(one => one.isRunning || fresh.some(each => each.id === one.id && each.state === 'needs-you'))
  const able = targets.filter(row => isArchivable(row.board ?? { state: row.state }, row.live))
  const allowed = able.filter(row => !busyOf(row))
  const refused = rows.filter(row => !able.some(one => one.id === row.id)).map(row => row.name)
  if (refused.length) $.ui.toast(`Not archived: ${refused.join(', ')} ${refused.length === 1 ? 'is' : 'are'} still working or waiting for your answer.`)
  for (const busy of able.flatMap(row => busyOf(row) ?? [])) $.ui.toast(`Not archived: ${busy.name || busy.title} is still working`)
  const first = allowed[0]
  const losses = first ? lossesOf(first, trees, sessions) : []
  if (!all && first && losses.length && JSON.stringify(losses) !== JSON.stringify(confirmed)) {
    await setExpanded($, () => [first.id])
    await setConfirming($, `archive:${first.id}`)
    return
  }
  const clean = all ? allowed.filter(row => !lossesOf(row, trees, sessions).length) : allowed.slice(0, 1)
  const items = itemsOf(fresh, await getAgents($), await getWorkflows($), { trees, sessions })
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
  const group = all?.group ?? items.find(item => item.id === archived[0]?.id)?.group
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
