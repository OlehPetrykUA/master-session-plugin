import type { EngineInterface } from 'claude-code'

import { messageOf } from '../lib/format'
import { expandHome } from '../lib/git'
import {
  PROC_GRACE_MS,
  PROC_TIMEOUT_MS,
  chainOf,
  childrenOf,
  cwdPidsOf,
  descendantsOf,
  isPid,
  isProtected,
  isShell,
  keyOf,
  modelOf,
  parseLoad,
  parseLsof,
  parsePs,
  signOf,
  worktreeOf,
} from '../lib/processes'
import type { Model, ProcContext, ProcState, Proc, RunPath } from '../lib/processes'
import { rowsOf } from '../lib/rows'
import { getConfirming, getLive, getProcessesOpen, getRepos, setConfirming, setProcessesOpen } from '../state/atoms'
import { isOff } from './recorder'
import { boardOf, homeOf, isMaster, isPaneOpen } from './sources'

const FIELDS = 'pid=,ppid=,lstart=,%cpu=,rss=,etime=,ucomm='
const ASKING = 'process:'

type Snapshot = { isRead: boolean; load: string; error: string; model: Model }

const EMPTY: Snapshot = { isRead: false, load: '', error: '', model: { run: [], left: [], engines: {}, ancestors: [] } }

let uid = ''
let master = 0
let snapshot: Snapshot = EMPTY
let shown = ''
let reading: Promise<void> | undefined
const stopping = new Map<string, number>()
const notes = new Map<string, string>()
const flying = new Set<number>()

export function resetProcesses() {
  uid = ''
  master = 0
  snapshot = EMPTY
  shown = ''
  reading = undefined
  stopping.clear()
  notes.clear()
  flying.clear()
}

function run($: EngineInterface, argv: readonly string[]) {
  return $.process.run(argv, { timeoutMs: PROC_TIMEOUT_MS, env: { LC_ALL: 'C' } })
}

const firstLine = (text: string) => text.trim().split('\n')[0] ?? ''

const failure = (error: unknown) => firstLine(messageOf(error)) || 'unknown error'

async function tableOf($: EngineInterface): Promise<{ table: Proc[]; error: string }> {
  try {
    uid ||= (await run($, ['id', '-u'])).stdout.trim()
    if (!/^\d+$/.test(uid)) {
      uid = ''
      return { table: [], error: 'the user id is unknown' }
    }
    const ran = await run($, ['ps', '-x', '-U', uid, '-o', FIELDS])
    if (ran.exitCode !== 0) return { table: [], error: firstLine(ran.stderr) || `ps exited with ${ran.exitCode}` }
    return { table: parsePs(ran.stdout), error: '' }
  } catch (error) {
    return { table: [], error: failure(error) }
  }
}

async function masterOf($: EngineInterface, table: readonly Proc[]) {
  const isEngine = (pid: number) => table.some(one => one.pid === pid && one.ucomm === 'claude')
  if (master && isEngine(master)) return master
  master = 0
  try {
    const pid = Number((await run($, ['/bin/sh', '-c', 'echo $PPID'])).stdout.trim())
    if (isPid(pid) && isEngine(pid)) master = pid
  } catch {
    master = 0
  }
  return master
}

async function contextOf($: EngineInterface, masterPid: number): Promise<ProcContext> {
  const home = homeOf()
  const { board } = await boardOf($)
  const live = await getLive($)
  const repos = await getRepos($)
  const owned = new Map<string, string>()
  const add = (path: string | undefined, owner: string) => {
    const full = path ? expandHome(path, home).replace(/\/+$/, '') : ''
    if (full.startsWith('/') && full.length > 1 && !owned.get(full)) owned.set(full, owner)
  }
  for (const row of rowsOf(board, live)) {
    add(row.board?.cwd ?? row.live?.cwd, row.id)
    for (const path of row.board?.worktrees ?? []) add(path, row.id)
  }
  for (const repo of repos) for (const tree of repo.worktrees) if (!tree.isMain) add(tree.path, '')
  const paths: RunPath[] = [...owned].map(([path, owner]) => ({ path, owner }))
  return { home, masterPid, paths, repos: repos.map(repo => repo.path.split('/').filter(Boolean).at(-1) ?? '').filter(Boolean) }
}

async function readOnce($: EngineInterface) {
  const { table, error } = await tableOf($)
  const [loaded, pid] = await Promise.all([run($, ['sysctl', '-n', 'vm.loadavg', 'hw.logicalcpu']).then(ran => (ran.exitCode === 0 ? parseLoad(ran.stdout) : ''), () => ''), error ? 0 : masterOf($, table)])
  let next: Snapshot = { isRead: true, load: loaded, error: '', model: EMPTY.model }
  if (error) next = { ...next, error: `Can’t read processes: ${error}` }
  else if (!pid) next = { ...next, error: 'Can’t read processes: the session’s own process was not found' }
  else {
    try {
      const pids = cwdPidsOf(table)
      const ran = pids.length ? await run($, ['lsof', '-a', '-d', 'cwd', '-p', pids.join(','), '-Fpn']) : undefined
      const cwds = ran && (ran.exitCode === 0 || ran.stdout) ? parseLsof(ran.stdout) : new Map<number, string>()
      next = { ...next, model: modelOf(table, cwds, await contextOf($, pid)) }
    } catch (failed) {
      next = { ...next, error: `Can’t read processes: ${failure(failed)}` }
    }
  }
  snapshot = next
  const sign = signOf(next.load, next.error, next.model)
  if (sign !== shown) {
    shown = sign
    $.ui.invalidate('ui.render')
  }
}

export async function readProcesses($: EngineInterface) {
  if (isOff() || !(await isMaster($)) || !(await isPaneOpen($)) || !(await getProcessesOpen($))) return
  if (reading) return reading
  reading = readOnce($).finally(() => {
    reading = undefined
  })
  return reading
}

export async function processesStateOf($: EngineInterface, at: number): Promise<ProcState | null> {
  if (!(await isMaster($))) return null
  const isOpen = await getProcessesOpen($)
  const asking = await getConfirming($)
  const since = Object.fromEntries([...stopping].map(([key, from]) => [key, Math.max(0, Math.floor((at - from) / 1000))]))
  return {
    isOpen,
    isRead: snapshot.isRead,
    load: snapshot.load,
    error: snapshot.error,
    run: snapshot.model.run,
    left: snapshot.model.left,
    asking: asking.startsWith(ASKING) ? asking.slice(ASKING.length) : '',
    stopping: since,
    notes: Object.fromEntries(notes),
  }
}

export const stoppingLabelOf = (at: number) => [...stopping].map(([key, from]) => `${key}:${Math.floor((at - from) / 1000)}`).join(',')

export async function toggleProcesses($: EngineInterface) {
  await setProcessesOpen($, open => !open)
  $.ui.invalidate('ui.render')
  if (await getProcessesOpen($)) await readProcesses($).catch(() => undefined)
}

export function askStop($: EngineInterface, key: string) {
  return setConfirming($, `${ASKING}${key}`)
}

export function cancelStop($: EngineInterface) {
  return setConfirming($, '')
}

export type StopTarget = { pid: number; lstart: string; ucomm: string; group: 'run' | 'left' }

function noteOf($: EngineInterface, key: string, text: string) {
  notes.set(key, text)
  $.ui.invalidate('ui.render')
}

async function killOf($: EngineInterface, signal: 'TERM' | 'KILL', pids: readonly number[]) {
  const safe = [...new Set(pids)].filter(isPid).sort((left, right) => left - right)
  if (!safe.length) return ''
  try {
    const ran = await run($, ['kill', '-s', signal, ...safe.map(String)])
    return ran.stderr.split('\n').find(line => /Operation not permitted/.test(line))?.trim() ?? ''
  } catch (error) {
    return failure(error)
  }
}

async function attempt($: EngineInterface, target: StopTarget, key: string) {
  const { table, error } = await tableOf($)
  if (error) return noteOf($, key, `Could not stop ${target.ucomm}: ${error}`)
  const byPid = new Map(table.map(one => [one.pid, one]))
  const now = byPid.get(target.pid)
  if (!now || now.lstart !== target.lstart || now.ucomm !== target.ucomm) return noteOf($, key, 'Already ended')
  const refuse = () => noteOf($, key, 'No longer from this run')
  const masterPid = await masterOf($, table)
  if (!masterPid) return noteOf($, key, `Could not stop ${target.ucomm}: the session’s own process was not found`)
  const engineAt = snapshot.model.engines
  const isEngine = (one: Proc) => one.ucomm === 'claude' || engineAt[one.pid] === one.lstart
  const guarded = new Set([masterPid, ...chainOf(byPid, masterPid).slice(1).map(one => one.pid)])
  const isSafe = (one: Proc) => isPid(one.pid) && !isProtected(one) && !isEngine(one) && !guarded.has(one.pid)
  if (!isSafe(now)) return refuse()
  const chain = chainOf(byPid, target.pid)
  if (target.group === 'run') {
    const at = chain.findIndex(one => engineAt[one.pid] === one.lstart)
    const below = at > 0 ? chain[at - 1] : undefined
    if (!below || !isShell(below) || !snapshot.model.run.some(one => keyOf(one) === keyOf(target))) return refuse()
  }
  const kids = childrenOf(table)
  const targets = [now, ...descendantsOf(kids, now.pid, one => !isSafe(one))]
  if (target.group === 'left') {
    const root = chain.find(one => one.ppid === 1)
    const known = root ? snapshot.model.left.find(one => one.pid === root.pid && one.lstart === root.lstart) : undefined
    if (!root || !known) return refuse()
    const pids = [...new Set([root.pid, ...targets.map(one => one.pid)])].sort((left, right) => left - right)
    const ran = await run($, ['lsof', '-a', '-d', 'cwd', '-p', pids.join(','), '-Fpn']).catch(() => undefined)
    const cwd = ran ? parseLsof(ran.stdout).get(root.pid) : undefined
    if (!ran || worktreeOf(cwd, await contextOf($, masterPid)) !== known.worktree) return refuse()
  }
  const reason = await killOf($, 'TERM', targets.map(one => one.pid))
  if (reason) return noteOf($, key, `Could not stop ${target.ucomm}: ${reason}`)
  stopping.set(key, await $.clock.now())
  $.ui.invalidate('ui.render')
  await $.clock.sleep(PROC_GRACE_MS)
  const again = await tableOf($)
  if (again.error) return noteOf($, key, `Could not stop ${target.ucomm}: ${again.error}`)
  const alive = new Map(again.table.map(one => [one.pid, one]))
  const left = targets.filter(one => alive.get(one.pid)?.lstart === one.lstart)
  const killed = await killOf($, 'KILL', left.map(one => one.pid))
  if (killed) noteOf($, key, `Could not stop ${target.ucomm}: ${killed}`)
}

export async function stopProcess($: EngineInterface, target: StopTarget) {
  const key = keyOf(target)
  if (!isPid(target.pid) || (await getConfirming($)) !== `${ASKING}${key}`) return
  if (flying.has(target.pid) || isOff()) return
  flying.add(target.pid)
  try {
    if (!(await isMaster($))) return
    await setConfirming($, '')
    notes.delete(key)
    await attempt($, target, key)
  } catch (error) {
    noteOf($, key, `Could not stop ${target.ucomm}: ${failure(error)}`)
  } finally {
    stopping.delete(key)
    flying.delete(target.pid)
    $.ui.invalidate('ui.render')
  }
}
