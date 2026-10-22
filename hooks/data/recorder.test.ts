import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { REPORTS_TOOL, REPORT_TOOL, askText } from './contract'
import type { Report } from './contract'
import { commitOf, isTestCommand, recordTurnEnd, recorder, repoOf, roleOf, startRecorder, summaryOf, syncAgents } from './recorder'
import { boardPath, reportPath } from './status'

const HOME = '/home/me'
const SELF = 'local_worker'
const MASTER = 'local_master'
const ENGINE = 'engine-worker'
const MIN = 60_000
const NOW = 100 * MIN
const FILE = reportPath(HOME, SELF)
const STATUS = '# branch.oid 1a2b3c4\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -0\n1 .M N... 100644 100644 100644 a b x.ts\n'

const OUTPUT: Record<string, string> = {
  'cd ~/dotfiles && git commit -m "feat(mods): x"': '[main 1a2b3c4] feat(mods): x\n 1 file changed, 2 insertions(+)',
  'git commit -m "broken"': '[main 9f9f9f9] broken',
  'pytest -q tests FAIL': '1 failed, 3 passed in 0.2s',
  'tsc -p . --noEmit': '',
}

type Hook = ($: unknown, e: unknown, next: (e: unknown) => Promise<unknown>) => unknown

type Event = Record<string, unknown>

const BOTTOM: Record<string, (e: Event) => unknown> = {
  'turn.start': e => ({ turnId: e.turnId }),
  'session.receive': e => ({ text: e.text }),
  'tool.call': e => {
    const command = typeof e.command === 'string' ? e.command : ''
    const output = OUTPUT[command] ?? 'ok'
    const isError = command.includes('FAIL') || command.includes('broken')
    return { result: { stdout: output, stderr: '', interrupted: false }, text: output, ...(isError ? { isError: true } : {}) }
  },
}

const settle = async () => {
  for (let round = 0; round < 200; round += 1) await Promise.resolve()
}

function world(parent = MASTER, files: Record<string, string> = {}) {
  const registered: { name: string; isDeferred?: unknown }[] = []
  const ran: string[][] = []
  const atoms: Record<string, { value: unknown; version: number }> = {}
  const holding = { now: 0, get: 0 }
  const waiting: (() => void)[] = []
  const gated = <T>(kind: 'now' | 'get', value: () => T): Promise<T> => {
    if (!holding[kind]) return Promise.resolve(value())
    holding[kind] -= 1
    return new Promise<T>(resolve => waiting.push(() => resolve(value())))
  }
  const $ = {
    env: { get: async (name: string) => (name === 'HOME' ? HOME : undefined) },
    session: { id: async () => ENGINE, cwd: async () => HOME },
    clock: { now: () => gated('now', () => NOW) },
    mcp: {
      call: async (_server: string, tool: string) => ({
        content: [{ type: 'text', text: JSON.stringify(tool === 'get_session' ? { sessionId: SELF, ...(parent ? { parentSessionId: parent } : {}) } : []) }],
        isError: false,
      }),
    },
    tool: {
      register: async (spec: { name: string; isDeferred?: unknown }) => {
        registered.push({ name: spec.name, isDeferred: spec.isDeferred })
        return { tool: `mcp__master-session__${spec.name}` }
      },
    },
    process: {
      run: async (argv: readonly string[]) => {
        ran.push([...argv])
        return { exitCode: 0, stdout: STATUS, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
      },
    },
    fs: {
      write: async (path: string, text: string) => {
        files[path] = text
      },
      read: async (path: string) => {
        const text = files[path]
        if (text === undefined) throw new Error(`ENOENT ${path}`)
        return text
      },
      list: async (dir: string) =>
        Object.entries(files)
          .filter(([path]) => path.startsWith(`${dir}/`))
          .map(([path, text]) => ({ name: path.slice(dir.length + 1), kind: 'file', size: text.length, mtimeMs: 1, isLink: false })),
      stat: async (path: string) => {
        const text = files[path]
        if (text === undefined) throw new Error(`ENOENT ${path}`)
        return { kind: 'file', size: text.length, mtimeMs: 1, isLink: false }
      },
    },
    state: {
      get: (ref: { key: string }) => gated('get', () => atoms[ref.key] ?? { value: undefined, version: 0 }),
      set: async (ref: { key: string }, value: unknown, options: { ifVersion?: number } = {}) => {
        const version = atoms[ref.key]?.version ?? 0
        if (options.ifVersion !== undefined && options.ifVersion !== version) return { isSet: false, version }
        atoms[ref.key] = { value, version: version + 1 }
        return { isSet: true, version: version + 1 }
      },
    },
  }
  const hooks = new Map<string, Hook[]>()
  const on = ((event: string, hook: Hook) => {
    hooks.set(event, [...(hooks.get(event) ?? []), hook])
    return { catch: () => undefined }
  }) as unknown as On
  recorder(on)
  const fire = async (event: string, e: Event): Promise<Event> => {
    const chain = hooks.get(event) ?? []
    const run = async (index: number, input: unknown): Promise<unknown> => {
      const hook = chain[index]
      return hook ? hook($, input, next => run(index + 1, next)) : BOTTOM[event]?.(input as Event)
    }
    return (await run(0, e)) as Event
  }
  const start = async () => {
    await startRecorder($ as never)
    await settle()
  }
  const end = (e: Event) => recordTurnEnd($ as never, e as never)
  const reportNow = () => (files[FILE] ? (JSON.parse(files[FILE]) as Report) : undefined)
  const bash = (command: string) => fire('tool.call', { tool: 'Bash', tool_use_id: command, command })
  const report = (input: Event) => fire('tool.call', { tool: REPORT_TOOL, tool_use_id: 'report', ...input })
  const receive = (text: string) => fire('session.receive', { origin: { kind: 'peer' }, text })
  const hold = (kind: 'now' | 'get') => {
    holding[kind] += 1
  }
  const release = () => waiting.splice(0).forEach(resume => resume())
  const seed = (key: string, value: unknown) => {
    atoms[key] = { value, version: 1 }
  }
  const sync = () => syncAgents($ as never)
  return { fire, start, end, registered, ran, reportNow, bash, report, receive, hold, release, seed, sync }
}

const ended = (turnId: string, patch: Event = {}) => ({ answer: '', durationMs: 1, isAborted: false, turnId, reason: 'answer', ...patch })

test('the helpers read a commit line, test runners, the last output line and the repo of a command', () => {
  expect(commitOf('git commit -m "x"', '[main 1a2b3c4] feat: x\n 1 file changed')).toEqual({ sha: '1a2b3c4', subject: 'feat: x' })
  expect(commitOf('git commit -m "x"', '[main (root-commit) 0abcdef] initial')).toEqual({ sha: '0abcdef', subject: 'initial' })
  expect(commitOf('git log --oneline', '[main 1a2b3c4] feat: x')).toBeUndefined()
  expect(commitOf('git commit --amend', 'nothing to commit')).toBeUndefined()
  for (const command of ['pytest -q', 'npm test', 'pnpm run test', 'claude plugin test ~/mod', '/opt/homebrew/bin/tsc -p . --noEmit', 'python3 tests/test_hooks.py']) expect(isTestCommand(command)).toBe(true)
  for (const command of ['ls', 'git status', 'cat test.txt']) expect(isTestCommand(command)).toBe(false)
  expect(summaryOf('a\n\n  13 passed  \n\n')).toBe('13 passed')
  expect(repoOf('cd ~/dotfiles && git commit -m x', HOME)).toBe(`${HOME}/dotfiles`)
  expect(repoOf('git -C "/repo/one" commit -m x', HOME)).toBe('/repo/one')
  expect(repoOf('git commit -m x', HOME)).toBe('')
})

test('a worker started by a master registers report in front and writes its first file', async () => {
  const run = world()
  await run.start()
  expect(run.registered).toEqual([{ name: 'report', isDeferred: false }])
  expect(roleOf()).toEqual({ role: 'worker', self: SELF, parent: MASTER, engineId: ENGINE })
  expect(run.reportNow()).toEqual(expect.objectContaining({ v: 1, kind: 'status', session: SELF, parent: MASTER, engineId: ENGINE, seq: 1, state: 'working' }))
})

test('a restarted worker continues from its own file instead of resetting seq', async () => {
  const before = { v: 1, kind: 'status', session: SELF, engineId: 'old', parent: MASTER, seq: 41, at: 1, run: { isRunning: false }, modelAt: 1, state: 'waiting', activity: [], commits: [], tests: [], files: [] }
  const run = world(MASTER, { [FILE]: JSON.stringify(before) })
  await run.start()
  expect(run.reportNow()).toEqual(expect.objectContaining({ seq: 42, engineId: ENGINE, state: 'waiting' }))
})

test('a session with no parent and no board that lists it is a master: reports tool only, nothing recorded', async () => {
  const run = world('')
  await run.start()
  expect(roleOf().role).toBe('master')
  expect(run.registered).toEqual([{ name: 'reports', isDeferred: undefined }])
  await run.bash('cd ~/dotfiles && git commit -m "feat(mods): x"')
  await run.fire('turn.start', { text: 'go', turnId: 't1' })
  expect(run.reportNow()).toBeUndefined()
  expect(JSON.stringify(await run.report({ now: 'x' }))).toContain('no master session')
})

test('a master lists its own workers’ reports through the reports tool', async () => {
  const dir = `${HOME}/.claude/state/master-session/sessions`
  const worker = (session: string, parent: string) =>
    JSON.stringify({ v: 1, kind: 'status', session, engineId: `engine-${session}`, parent, seq: 3, at: NOW - 5 * MIN, run: { isRunning: true }, modelAt: NOW - 5 * MIN, state: 'working', progress: { step: 2, of: 4, label: 'build' }, now: 'coding', activity: [], commits: [], tests: [], files: [] })
  const board = { v: 1, kind: 'board', at: NOW, masterId: SELF, masterTitle: 'Validator', board: { sessions: [{ id: 'local_b', name: 'beta', title: 'Beta task', state: 'working' }] } }
  const run = world('', { [`${dir}/local_b.json`]: worker('local_b', SELF), [`${dir}/local_c.json`]: worker('local_c', 'local_other'), [boardPath(HOME, SELF)]: JSON.stringify(board) })
  await run.start()
  const listed = await run.fire('tool.call', { tool: REPORTS_TOOL, tool_use_id: 'r' })
  expect(JSON.parse(String(listed.result))).toEqual({
    sessions: [{ id: 'local_b', title: 'Beta task', at: new Date(NOW - 5 * MIN).toISOString(), ageMinutes: 5, state: 'working', progress: 'step 2 of 4 — build', now: 'coding' }],
  })
})

test('a worker without parentSessionId finds its master in the board files', async () => {
  const board = { v: 1, kind: 'board', at: 1, masterId: MASTER, masterTitle: 'Validator', board: { sessions: [{ id: SELF, state: 'working' }] } }
  const run = world('', { [boardPath(HOME, MASTER)]: JSON.stringify(board) })
  await run.start()
  expect(roleOf()).toEqual({ role: 'worker', self: SELF, parent: MASTER, engineId: ENGINE })
  expect(run.reportNow()?.parent).toBe(MASTER)
})

test('the report tool answers ok #seq, stores the stated intent and rejects a bad step', async () => {
  const run = world()
  await run.start()
  expect(await run.report({ state: 'working', progress: 'step 2 of 5 — build', now: 'writing tests', next: 'commit' })).toEqual({ result: 'ok #2' })
  expect(run.reportNow()).toEqual(expect.objectContaining({ seq: 2, modelAt: NOW, progress: { step: 2, of: 5, label: 'build' }, now: 'writing tests', next: 'commit' }))
  expect(JSON.stringify(await run.report({ progress: 'step 6 of 5' }))).toContain('step N of M')
  expect(JSON.stringify(await run.report({ progress: 'step 1 of 0' }))).toContain('deny')
  expect(run.reportNow()?.seq).toBe(2)
})

test('commits, test runs and edits are recorded from tool calls; failures and other commands are not commits', async () => {
  const run = world()
  await run.start()
  await run.bash('cd ~/dotfiles && git commit -m "feat(mods): x"')
  const committed = run.reportNow()
  expect(committed?.commits).toEqual([{ sha: '1a2b3c4', subject: 'feat(mods): x', at: NOW }])
  expect(committed?.activity.map(one => one.text)).toEqual(['committed 1a2b3c4'])
  expect(committed?.git).toEqual({ branch: 'main', dirty: 1, ahead: 2, at: NOW, path: `${HOME}/dotfiles` })
  expect(run.ran.at(-1)).toEqual(['git', '--no-optional-locks', '-C', `${HOME}/dotfiles`, 'status', '--porcelain=v2', '--branch'])
  await run.bash('git commit -m "broken"')
  await run.bash('pytest -q tests FAIL')
  await run.bash('tsc -p . --noEmit')
  const seq = run.reportNow()?.seq
  await run.bash('ls')
  expect(run.reportNow()?.seq).toBe(seq)
  const tested = run.reportNow()
  expect(tested?.commits.map(one => one.sha)).toEqual(['1a2b3c4'])
  expect(tested?.tests.map(one => [one.cmd, one.ok, one.summary])).toEqual([
    ['pytest -q tests FAIL', false, '1 failed, 3 passed in 0.2s'],
    ['tsc -p . --noEmit', true, ''],
  ])
  await run.fire('tool.call', { tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })
  const edited = run.reportNow()?.seq ?? 0
  await run.fire('tool.call', { tool: 'Edit', tool_use_id: 'e2', file_path: '/repo/a.ts', old_string: 'b', new_string: 'c' })
  await run.fire('tool.call', { tool: 'Write', tool_use_id: 'w1', file_path: '/repo/b.ts', content: 'x' })
  expect(run.reportNow()?.files).toEqual(['/repo/a.ts', '/repo/b.ts'])
  expect(run.reportNow()?.seq).toBe(edited + 1)
})

test('turns set run and waits; refusal and error ends are needs-you, the next turn clears it; subagent turns are ignored', async () => {
  const run = world()
  await run.start()
  await run.fire('turn.start', { text: 'go', turnId: 't1' })
  expect(run.reportNow()?.run).toEqual({ isRunning: true, since: NOW })
  await run.end(ended('t1'))
  expect(run.reportNow()).toEqual(
    expect.objectContaining({ run: { isRunning: false, since: NOW, lastEnd: { at: NOW, reason: 'answer' } }, waits: { since: NOW, on: 'the next message' } }),
  )
  await run.fire('turn.start', { text: 'go on', turnId: 't2' })
  await run.end(ended('t2', { reason: 'refusal', refusal: { category: null, explanation: 'policy' } }))
  expect(run.reportNow()).toEqual(expect.objectContaining({ state: 'needs-you', needsYou: 'the turn was refused: policy', waits: { since: NOW, on: 'you' } }))
  await run.fire('turn.start', { text: 'answered', turnId: 't3' })
  const resumed = run.reportNow()
  expect([resumed?.state, resumed?.needsYou, resumed?.waits]).toEqual(['working', undefined, undefined])
  await run.end(ended('t3', { reason: 'error' }))
  expect(run.reportNow()?.needsYou).toBe('the turn ended on an API error')
  const seq = run.reportNow()?.seq
  await run.fire('turn.start', { text: 'sub', turnId: 's1', agentId: 'sub-1' })
  await run.end(ended('s1', { agentId: 'sub-1' }))
  expect(run.reportNow()?.seq).toBe(seq)
})

test('an Ask is consumed when the worker is idle or its report fresh, and nudged when it runs on a stale report', async () => {
  const run = world()
  await run.start()
  const ask = askText({ from: MASTER, at: NOW })
  expect(await run.receive(ask)).toEqual({ consumed: expect.stringContaining('ask') })
  expect(run.reportNow()?.seq).toBe(2)
  await run.fire('turn.start', { text: 'go', turnId: 't1' })
  const stale = await run.receive(ask)
  expect(String(stale.text)).toContain('next step boundary')
  await run.report({ now: 'coding' })
  expect((await run.receive(ask)).consumed).toBeDefined()
  expect(await run.receive('hello')).toEqual({ text: 'hello' })
  expect(await run.fire('session.receive', { origin: { kind: 'peer' }, text: ask, agentId: 'sub-1' })).toEqual({ text: ask })
})

test('an agent sync that began before the answer never writes the old ask back over the cleared one', async () => {
  const run = world()
  run.seed('agents', [{ id: 'a2', type: 'Explore', description: 'Check one caller', state: 'running', startedAt: NOW }])
  await run.start()
  await run.fire('classic.PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, agent_id: 'a2' })
  expect(run.reportNow()?.agents?.[0]?.asking?.text).toBe('Allow Bash: rm -rf build')
  run.hold('now')
  const background = run.sync()
  await settle()
  const answered = run.fire('tool.call', { tool: 'Bash', tool_use_id: 'b', command: 'rm -rf build', agentId: 'a2' })
  await settle()
  run.release()
  await Promise.all([background, answered])
  await settle()
  expect(run.reportNow()?.agents?.[0]?.asking).toBeUndefined()
})

test('a save never drops a change another save made while it waited', async () => {
  const run = world()
  await run.start()
  run.hold('get')
  const reporting = run.report({ now: 'writing tests' })
  await settle()
  await run.fire('turn.start', { text: 'go', turnId: 't1' })
  run.release()
  await reporting
  await settle()
  expect([run.reportNow()?.now, run.reportNow()?.run.isRunning]).toEqual(['writing tests', true])
})
