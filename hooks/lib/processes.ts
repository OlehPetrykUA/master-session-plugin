import { compactOf } from './format'
import { CH, bodyWidthOf } from './layout'
import { rowsOf } from './list'

export const PROC_ROWS = 12
export const PROC_GRACE_MS = 5_000
export const PROC_TIMEOUT_MS = 5_000
export const SHELLS = ['zsh', 'bash', 'sh'] as const
export const PROTECTED = ['claude', 'Claude', 'disclaimer'] as const

export type Proc = { pid: number; ppid: number; lstart: string; cpu: number; rss: number; etime: number; ucomm: string }

export type RunPath = { path: string; owner: string }

export type ProcContext = { home: string; masterPid: number; paths: readonly RunPath[]; repos: readonly string[] }

export type Shown = { pid: number; lstart: string; ucomm: string; owner: string; cpu: number; rss: number; etime: number; canStop: boolean; group: 'run' | 'left'; worktree: string }

export type Model = { run: Shown[]; left: Shown[]; engines: Record<number, string>; ancestors: number[] }

const LINE = /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+([\d.]+)\s+(\d+)\s+([\d:.-]+)\s+(.+?)\s*$/

export function etimeOf(text: string) {
  const [days, clock] = text.includes('-') ? text.split('-') : ['0', text]
  const parts = (clock ?? '').split(':').map(Number)
  const [seconds = 0, minutes = 0, hours = 0] = parts.reverse()
  return ((Number(days) * 24 + hours) * 60 + minutes) * 60 + seconds
}

export function parsePs(stdout: string): Proc[] {
  return stdout.split('\n').flatMap(line => {
    const found = LINE.exec(line)
    if (!found) return []
    const [, pid = '', ppid = '', lstart = '', cpu = '', rss = '', etime = '', ucomm = ''] = found
    return [{ pid: Number(pid), ppid: Number(ppid), lstart: lstart.replace(/\s+/g, ' '), cpu: Number(cpu), rss: Number(rss), etime: etimeOf(etime), ucomm }]
  })
}

export function parseLsof(stdout: string) {
  const cwds = new Map<number, string>()
  let pid = 0
  for (const line of stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (line.startsWith('n') && pid) cwds.set(pid, line.slice(1))
  }
  return cwds
}

export function parseLoad(stdout: string) {
  const [first = '', second = ''] = stdout.trim().split('\n')
  const averages = first.replace(/[{}]/g, '').trim().split(/\s+/).map(Number)
  const cores = Number(second.trim())
  if (averages.length < 3 || averages.some(one => !Number.isFinite(one))) return ''
  return `${averages
    .slice(0, 3)
    .map(one => one.toFixed(1))
    .join(' · ')}${Number.isInteger(cores) && cores > 0 ? ` · ${cores} cores` : ''}`
}

export const cpuText = (cpu: number) => `${Math.round(cpu)}%`

export function memText(rss: number) {
  const mb = Math.round(rss / 1024)
  return mb >= 1024 ? `${(rss / 1024 / 1024).toFixed(1)} GB` : `${mb} MB`
}

export const timeText = (seconds: number) => (seconds < 60 ? `${Math.max(0, Math.floor(seconds))}s` : compactOf(seconds * 1000))

export const isPid = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 1

export const keyOf = (one: Pick<Shown, 'pid' | 'lstart'>) => `${one.pid}@${one.lstart}`

const isUnder = (path: string, root: string) => path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`)

export function ownerPathOf(cwd: string | undefined, paths: readonly RunPath[]) {
  if (!cwd) return undefined
  let best: RunPath | undefined
  for (const one of paths) if (isUnder(cwd, one.path) && (!best || one.path.length > best.path.length)) best = one
  return best
}

export function worktreeOf(cwd: string | undefined, context: Pick<ProcContext, 'home' | 'repos'>) {
  const root = `${context.home}/.claude/worktrees/`
  if (!cwd || !context.home || !cwd.startsWith(root)) return ''
  const name = cwd.slice(root.length).split('/')[0] ?? ''
  const repo = [...context.repos].sort((left, right) => right.length - left.length).find(one => name.startsWith(`wt-${one}-`))
  return repo && !name.slice(`wt-${repo}-`.length).includes('-') ? name : ''
}

export function chainOf(table: ReadonlyMap<number, Proc>, pid: number) {
  const chain: Proc[] = []
  let at = table.get(pid)
  while (at && !chain.includes(at)) {
    chain.push(at)
    at = table.get(at.ppid)
  }
  return chain
}

export function childrenOf(table: readonly Proc[]) {
  const kids = new Map<number, Proc[]>()
  for (const one of table) kids.set(one.ppid, [...(kids.get(one.ppid) ?? []), one])
  return kids
}

export function descendantsOf(kids: ReadonlyMap<number, Proc[]>, pid: number, stop: (one: Proc) => boolean = () => false) {
  const found: Proc[] = []
  const seen = new Set<number>([pid])
  const queue = [...(kids.get(pid) ?? [])]
  for (let one = queue.shift(); one; one = queue.shift()) {
    if (seen.has(one.pid) || stop(one)) continue
    seen.add(one.pid)
    found.push(one)
    queue.push(...(kids.get(one.pid) ?? []))
  }
  return found
}

export const isProtected = (one: Proc) => (PROTECTED as readonly string[]).includes(one.ucomm)

export const isShell = (one: Proc) => (SHELLS as readonly string[]).includes(one.ucomm)

export const lessOf = (left: Pick<Shown, 'cpu' | 'etime' | 'pid'>, right: Pick<Shown, 'cpu' | 'etime' | 'pid'>) => right.cpu - left.cpu || right.etime - left.etime || left.pid - right.pid

export function cwdPidsOf(table: readonly Proc[]) {
  const kids = childrenOf(table)
  const byPid = new Map(table.map(one => [one.pid, one]))
  const hasClaude = (one: Proc) => chainOf(byPid, one.ppid).some(up => up.ucomm === 'claude')
  const engines = table.filter(one => one.ucomm === 'claude' && !hasClaude(one))
  const roots = engines.flatMap(engine => (kids.get(engine.pid) ?? []).filter(isShell))
  const below = roots.flatMap(root => descendantsOf(kids, root.pid))
  const orphans = table.filter(one => one.ppid === 1)
  return [...new Set([...engines, ...roots, ...below, ...orphans].map(one => one.pid))].sort((left, right) => left - right)
}

export function modelOf(table: readonly Proc[], cwds: ReadonlyMap<number, string>, context: ProcContext): Model {
  const byPid = new Map(table.map(one => [one.pid, one]))
  const kids = childrenOf(table)
  const hasClaude = (one: Proc) => chainOf(byPid, one.ppid).some(up => up.ucomm === 'claude')
  const engines = table.filter(one => one.ucomm === 'claude' && !hasClaude(one) && (one.pid === context.masterPid || !!ownerPathOf(cwds.get(one.pid), context.paths)))
  const engineSet = new Set(engines.map(one => one.pid))
  const ancestors = chainOf(byPid, context.masterPid)
    .slice(1)
    .map(one => one.pid)
  const guarded = new Set([context.masterPid, ...ancestors])
  const seen = new Set<number>()
  const run: Shown[] = []
  const shown = (one: Proc, group: 'run' | 'left', owner: string, worktree: string): Shown => ({
    pid: one.pid,
    lstart: one.lstart,
    ucomm: one.ucomm,
    owner,
    cpu: one.cpu,
    rss: one.rss,
    etime: one.etime,
    canStop: isPid(one.pid) && !isProtected(one) && !engineSet.has(one.pid) && !guarded.has(one.pid),
    group,
    worktree,
  })
  for (const engine of engines) {
    const engineOwner = engine.pid === context.masterPid ? 'master' : (ownerPathOf(cwds.get(engine.pid), context.paths)?.owner ?? '')
    for (const root of (kids.get(engine.pid) ?? []).filter(isShell)) {
      const below = descendantsOf(kids, root.pid, one => engineSet.has(one.pid))
      for (const one of below.length ? below : [root]) {
        if (seen.has(one.pid)) continue
        seen.add(one.pid)
        run.push(shown(one, 'run', ownerPathOf(cwds.get(one.pid), context.paths)?.owner || engineOwner, ''))
      }
    }
  }
  const left: Shown[] = []
  for (const root of table.filter(one => one.ppid === 1 && !seen.has(one.pid) && !engineSet.has(one.pid) && !guarded.has(one.pid))) {
    const worktree = worktreeOf(cwds.get(root.pid), context)
    if (!worktree) continue
    for (const one of [root, ...descendantsOf(kids, root.pid, each => engineSet.has(each.pid))]) {
      if (seen.has(one.pid)) continue
      seen.add(one.pid)
      left.push(shown(one, 'left', `left:${worktree}`, worktree))
    }
  }
  return { run: run.sort(lessOf), left: left.sort(lessOf), engines: Object.fromEntries(engines.map(one => [one.pid, one.lstart])), ancestors }
}

export type ProcNames = Readonly<Record<string, string>>

export const ownerText = (one: Pick<Shown, 'owner' | 'worktree'>, names: ProcNames) => (one.owner.startsWith('left:') ? `left behind (${one.worktree})` : one.owner === 'master' ? 'master' : one.owner ? names[one.owner] || '—' : '—')

export type ProcRow = { key: string; pid: number; lstart: string; program: string; owner: string; cpu: string; memory: string; time: string; canStop: boolean; group: 'run' | 'left' }

export type ProcState = {
  isOpen: boolean
  isRead: boolean
  load: string
  error: string
  run: readonly Shown[]
  left: readonly Shown[]
  asking: string
  stopping: Readonly<Record<string, number>>
  notes: Readonly<Record<string, string>>
}

export type ProcGroup = { id: 'run' | 'left'; rows: ProcRow[]; more: number; total: number }

export type ProcView = { isOpen: boolean; count: number; load: string; error: string; groups: ProcGroup[]; isEmpty: boolean; asking: string; stopping: Readonly<Record<string, number>>; notes: Readonly<Record<string, string>> }

export function processesViewOf(state: ProcState, names: ProcNames): ProcView {
  const group = (id: 'run' | 'left', list: readonly Shown[]): ProcGroup => ({
    id,
    total: list.length,
    more: Math.max(0, list.length - PROC_ROWS),
    rows: list.slice(0, PROC_ROWS).map(one => ({ key: keyOf(one), pid: one.pid, lstart: one.lstart, program: one.ucomm, owner: ownerText(one, names), cpu: cpuText(one.cpu), memory: memText(one.rss), time: timeText(one.etime), canStop: one.canStop, group: id })),
  })
  const groups = state.error ? [] : [group('run', state.run), ...(state.left.length ? [group('left', state.left)] : [])]
  const count = groups.reduce((sum, one) => sum + one.total, 0)
  return { isOpen: state.isOpen, count, load: state.load, error: state.error, groups, isEmpty: state.isRead && !state.error && !count, asking: state.asking, stopping: state.stopping, notes: state.notes }
}

export const stoppingText = (seconds: number) => `Stopping ${seconds}s`

export const confirmText = (row: Pick<ProcRow, 'program' | 'pid' | 'owner'>) => `Stop ${row.program} (pid ${row.pid}, ${row.owner})? It gets SIGTERM now and SIGKILL after 5 s if it still runs.`

export const processLineOf = (row: ProcRow) => [row.cpu, row.memory, row.time].join(' · ')

export const NARROW = 340
export const STOP_WIDE = 460

export function processesPxOf(view: ProcView, columns: number) {
  if (!view.isOpen) return 56
  const width = columns * CH
  const isNarrow = width < NARROW
  const room = bodyWidthOf(columns)
  const lines = (text: string, space: number) => Math.max(1, rowsOf(text, space, 12, 8).length)
  const body = () => {
    if (view.error) return 8 + lines(view.error, room - 24 - 24) * 16 + 8
    if (view.isEmpty) return 16
    let height = 2 + (isNarrow ? 0 : 25)
    let items = 0
    const add = (px: number) => {
      height += px + (items ? 1 : 0)
      items += 1
    }
    for (const group of view.groups) {
      if (group.id === 'left') add(28)
      for (const row of group.rows) {
        const note = view.notes[row.key]
        const isAsking = view.asking === row.key
        const isStopping = row.key in view.stopping
        add(isNarrow ? 44 : 36)
        if (note || (isStopping && width < STOP_WIDE)) height += 24
        if (isAsking) height += 8 + lines(confirmText(row), room - 8 - 24) * 16 + 8 + 32 + 12 + 4
      }
      if (group.more) add(28)
    }
    return height
  }
  const parts = [32, ...(view.load ? [16] : []), body()]
  return 12 + parts.reduce((sum, px) => sum + px, 0) + (parts.length - 1) * 8
}

export const signOf = (load: string, error: string, model: Pick<Model, 'run' | 'left'>) =>
  JSON.stringify([load, error, [...model.run, ...model.left].map(one => [one.pid, one.lstart, one.ucomm, one.owner, one.canStop, cpuText(one.cpu), memText(one.rss), timeText(one.etime)])])
