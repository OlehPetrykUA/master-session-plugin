import { HOME } from './world'

export const LSTART = 'Mon Oct 27 10:00:00 2026'

export type FakeProc = { pid: number; ppid: number; ucomm: string; cwd?: string; cpu?: number; rss?: number; etime?: string; lstart?: string }

export const K1 = `${HOME}/.claude/worktrees/wt-app-k1`
export const K2 = `${HOME}/.claude/worktrees/wt-app-k2`
export const K3 = `${HOME}/.claude/worktrees/wt-app-k3`

export const proc = (pid: number, ppid: number, ucomm: string, rest: Partial<FakeProc> = {}): FakeProc => ({ pid, ppid, ucomm, ...rest })

export const FIXTURE: FakeProc[] = [
  proc(5, 1, 'Claude'),
  proc(10, 5, 'disclaimer'),
  proc(100, 10, 'claude', { cwd: `${HOME}/Work/master` }),
  proc(110, 100, 'node'),
  proc(120, 100, 'zsh'),
  proc(130, 120, 'node', { cwd: K2, cpu: 40, rss: 86016, etime: '04:05' }),
  proc(500, 10, 'claude', { cwd: K1 }),
  proc(520, 500, 'zsh'),
  proc(530, 520, 'node', { cpu: 12.4, rss: 86016, etime: '00:45' }),
  proc(531, 530, 'node', { cpu: 3, rss: 1258291, etime: '01:03:10' }),
]

export type Fake = ReturnType<typeof fakeProcesses>

export function fakeProcesses(procs: FakeProc[], options: { shellParent?: number; slow?: number } = {}) {
  const calls: string[][] = []
  const state = {
    procs,
    shellParent: options.shellParent ?? 100,
    load: '{ 18.30 14.48 15.09 }\n10\n',
    psFails: '',
    psExit: 0,
    killExit: 0,
    killErr: '',
    survivesTerm: new Set<number>(),
    survivesKill: new Set<number>(),
    lsofCwds: undefined as Record<number, string> | undefined,
  }
  const kills: { signal: string; pids: string[] }[] = []
  const lines = () => state.procs.map(one => `${String(one.pid).padStart(5)} ${String(one.ppid).padStart(5)} ${one.lstart ?? LSTART} ${String(one.cpu ?? 0)} ${one.rss ?? 1024} ${one.etime ?? '00:10'} ${one.ucomm}`).join('\n')
  const out = (stdout: string, exitCode = 0, stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })
  const envs: (Record<string, string> | undefined)[] = []
  const handle = (argv: readonly string[], env?: Record<string, string>) => {
    const [cmd = '', ...args] = argv
    if (!['ps', 'lsof', 'sysctl', '/bin/sh', 'kill', 'id'].includes(cmd)) return undefined
    calls.push([...argv])
    if (cmd !== 'id' && cmd !== '/bin/sh') envs.push(env)
    if (cmd === 'id') return out(`${501}\n`)
    if (cmd === '/bin/sh') return out(`${state.shellParent}\n`)
    if (cmd === 'sysctl') return out(state.load)
    if (cmd === 'ps') return state.psExit ? out('', state.psExit, state.psFails) : out(`${lines()}\n`)
    if (cmd === 'lsof') {
      const wanted = (args[args.indexOf('-p') + 1] ?? '').split(',').map(Number)
      const cwds = state.lsofCwds ?? Object.fromEntries(state.procs.flatMap(one => (one.cwd ? [[one.pid, one.cwd]] : [])))
      return out(wanted.flatMap(pid => (cwds[pid] ? [`p${pid}`, 'fcwd', `n${cwds[pid]}`] : [])).join('\n'))
    }
    const signal = args[1] ?? ''
    const pids = args.slice(2)
    kills.push({ signal, pids })
    if (state.killExit && state.killErr.includes('Operation not permitted')) return out('', state.killExit, state.killErr)
    const stays = signal === 'KILL' ? state.survivesKill : state.survivesTerm
    state.procs = state.procs.filter(one => !pids.includes(String(one.pid)) || stays.has(one.pid))
    return out('', state.killExit, state.killErr)
  }
  const argvs = (cmd: string) => calls.filter(one => one[0] === cmd)
  return { calls, envs, state, kills, argvs, handle }
}
