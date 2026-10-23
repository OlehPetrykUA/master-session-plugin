import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { REPORTS_TOOL, REPORT_TOOL, askText } from './contract'
import type { Report } from './contract'
import { commitOf, engage, recordTurnEnd, recorder, repoOf, roleOf, sessionFacts, startRecorder, syncAgents, testsOf } from './recorder'
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
  'git commit -m "feat: y"': '[main 2b3c4d5] feat: y',
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
  if (parent && !files[boardPath(HOME, parent)]) files[boardPath(HOME, parent)] = '{}'
  const registered: { name: string; isDeferred?: unknown }[] = []
  const ran: string[][] = []
  const atoms: Record<string, { value: unknown; version: number }> = {}
  let at = NOW
  const holding = { now: 0, get: 0, mcp: 0 }
  const asked: string[] = []
  let failing = ''
  let brokenGit = ''
  const waiting: (() => void)[] = []
  const gated = <T>(kind: 'now' | 'get' | 'mcp', value: () => T): Promise<T> => {
    if (!holding[kind]) return Promise.resolve(value())
    holding[kind] -= 1
    return new Promise<T>(resolve => waiting.push(() => resolve(value())))
  }
  const $ = {
    env: { get: async (name: string) => (name === 'HOME' ? HOME : undefined) },
    session: { id: async () => ENGINE, cwd: async () => HOME },
    clock: { now: () => gated('now', () => at) },
    mcp: {
      call: (_server: string, tool: string, args: Record<string, unknown>) =>
        gated('mcp', () => {
          asked.push(`${tool} ${String(args.session_id)}`)
          const isFailing = failing === args.session_id
          return {
            content: [{ type: 'text', text: isFailing ? 'no such session' : JSON.stringify(tool === 'get_session' ? { sessionId: SELF, ...(args.session_id === 'local_nomodel' ? {} : { model: 'claude-opus-5-5' }), ...(parent ? { parentSessionId: parent } : {}) } : []) }],
            isError: isFailing,
          }
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
        return { exitCode: brokenGit && argv[argv.indexOf('-C') + 1] === brokenGit ? 128 : 0, stdout: STATUS, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
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
  const begin = async () => {
    await startRecorder($ as never)
  }
  const start = async () => {
    await begin()
    await engage($ as never)
    await settle()
  }
  const end = (e: Event) => recordTurnEnd($ as never, e as never)
  const reportNow = () => (files[FILE] ? (JSON.parse(files[FILE]) as Report) : undefined)
  const bash = (command: string) => fire('tool.call', { tool: 'Bash', tool_use_id: command, command })
  const report = (input: Event) => fire('tool.call', { tool: REPORT_TOOL, tool_use_id: 'report', ...input })
  const receive = (text: string) => fire('session.receive', { origin: { kind: 'peer' }, text })
  const fail = (id: string) => {
    failing = id
  }
  const later = (ms: number) => {
    at += ms
  }
  const breakGit = (path: string) => {
    brokenGit = path
  }
  const hold = (kind: 'now' | 'get' | 'mcp') => {
    holding[kind] += 1
  }
  const release = () => waiting.splice(0).forEach(resume => resume())
  const seed = (key: string, value: unknown) => {
    atoms[key] = { value, version: 1 }
  }
  const sync = () => syncAgents($ as never)
  return { $, fire, begin, start, end, registered, ran, asked, reportNow, bash, report, receive, hold, release, seed, sync, fail, breakGit, later }
}

const recordsTests = (command: string) => testsOf(command, '', true).length > 0

const ended = (turnId: string, patch: Event = {}) => ({ answer: '', durationMs: 1, isAborted: false, turnId, reason: 'answer', ...patch })

test('the helpers read a commit line, test runners, the last output line and the repo of a command', () => {
  expect(commitOf('git commit -m "x"', '[main 1a2b3c4] feat: x\n 1 file changed')).toEqual({ sha: '1a2b3c4', subject: 'feat: x' })
  expect(commitOf('git commit -m "x"', '[main (root-commit) 0abcdef] initial')).toEqual({ sha: '0abcdef', subject: 'initial' })
  expect(commitOf('git log --oneline', '[main 1a2b3c4] feat: x')).toBeUndefined()
  expect(commitOf('git commit --amend', 'nothing to commit')).toBeUndefined()
  for (const command of ['pytest -q', 'npm test', 'pnpm run test', 'claude plugin test ~/mod', '/opt/homebrew/bin/tsc -p . --noEmit', 'python3 tests/test_hooks.py']) expect(recordsTests(command)).toBe(true)
  for (const command of ['ls', 'git status', 'cat test.txt', 'cat hooks/data/agent-prompts.test.tsx', 'sed -n 1,20p hooks/persona.test.sh', 'ls tests/', 'grep -n tsc tsconfig.json', 'echo "plugin test exit $?"', "python3 - <<'EOF'\nimport pytest\nEOF"]) expect(recordsTests(command)).toBe(false)
  expect(repoOf('cd ~/dotfiles && git commit -m x', HOME)).toBe(`${HOME}/dotfiles`)
  expect(repoOf('git -C "/repo/one" commit -m x', HOME)).toBe('/repo/one')
  expect(repoOf('git -C "$HOME/x" commit -m x', HOME)).toBe(`${HOME}/x`)
  expect(repoOf('cd ${HOME}/x && git commit -m x', HOME)).toBe(`${HOME}/x`)
  expect(repoOf('git commit -m x', HOME)).toBe('')
})

test('a worker started by a master registers report in front and writes its first file', async () => {
  const run = world()
  await run.start()
  expect(run.registered).toEqual([{ name: 'report', isDeferred: false }])
  expect(roleOf()).toEqual({ role: 'worker', self: SELF, parent: MASTER })
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
  expect(roleOf()).toEqual({ role: 'worker', self: SELF, parent: MASTER })
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
  expect(run.reportNow()?.seq).toBe((seq ?? 0) + 2)
  expect(run.reportNow()).not.toHaveProperty('running')
  const tested = run.reportNow()
  expect(tested?.commits.map(one => one.sha)).toEqual(['1a2b3c4'])
  expect(tested?.tests.map(one => [one.cmd, one.ok])).toEqual([
    ['pytest · 3 passed · 1 failed', false],
    ['tsc · exit 0', true],
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
  expect(run.reportNow()?.agents?.[0]?.asking?.text).toBe('Allow Bash')
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

const GATE = [
  'cd "$HOME/.claude/worktrees/wt-master-session-plugin-band-v3"; L="/private/tmp/scratch/gate.log"; E="/Applications/claude"',
  '"$E" plugin validate --strict . > "$L" 2>&1; echo "validate exit $?"; grep -E "✔|✘" "$L"',
  '"$E" plugin test . > "$L" 2>&1; echo "plugin test exit $?"; tail -4 "$L"',
  'tsc -p . --noEmit > "$L" 2>&1; echo "tsc exit $?"',
  "sh hooks/persona.test.sh > \"$L\"; echo \"persona exit $?\"; python3 - \"$L\" <<'EOF'\nimport sys\nprint(open(sys.argv[1]).read().count('ok'))\nEOF",
].join('\n')

const GATE_OUT = 'validate exit 0\n✔ Validation passed\nplugin test exit 0\n\n 186 pass\n 0 fail\nRan 186 tests across 16 files. [12.02s]\ntsc exit 0\npersona exit 0\n12'

OUTPUT[GATE] = GATE_OUT

test('a multi-line gate script records one short "<tool> · <result>" label per check it runs, in order, never the raw script', () => {
  const tests = testsOf(GATE, GATE_OUT, false)
  expect(tests).toEqual([
    { cmd: 'validate · passed', ok: true },
    { cmd: 'plugin test · 186 pass', ok: true },
    { cmd: 'tsc · exit 0', ok: true },
    { cmd: 'persona.test · exit 0', ok: true },
  ])
  expect(tests.every(one => !/[\n/]|\$|cd /.test(one.cmd) && one.cmd.length <= 60)).toBe(true)
  expect(testsOf('"$E" plugin test .', ' 184 pass\n 2 fail', true)).toEqual([{ cmd: 'plugin test · 184 pass · 2 fail', ok: false }])
  expect(testsOf('tsc -p . --noEmit', 'a.ts(1,1): error TS2322: x\nb.ts(2,2): error TS7006: y', true)).toEqual([{ cmd: 'tsc · 2 errors', ok: false }])
  expect(testsOf('sh hooks/persona.test.sh', 'ok   a\nok   b\nFAIL c (exit 1)', true)).toEqual([{ cmd: 'persona.test · 2 ok · 1 fail', ok: false }])
  expect(testsOf('go test ./...', 'Exit code 2\nFAIL', true)).toEqual([{ cmd: 'go test · exit 2', ok: false }])
  expect(testsOf('python3 tests/test_hooks.py', '123 passed', false)).toEqual([{ cmd: 'test_hooks.py · 123 passed', ok: true }])
})

test('a gate script run through Bash stores the labels; a non-test call with "test" in a path stores nothing', async () => {
  const run = world()
  await run.start()
  await run.fire('tool.call', { tool: 'Bash', tool_use_id: 'gate', command: GATE })
  expect(run.reportNow()?.tests.map(one => one.cmd)).toEqual(['validate · passed', 'plugin test · 186 pass', 'tsc · exit 0', 'persona.test · exit 0'])
  const seq = run.reportNow()?.seq
  await run.bash('cat hooks/data/agent-prompts.test.tsx')
  await run.bash('sed -n 1,20p hooks/persona.test.sh')
  expect(run.reportNow()?.seq).toBe((seq ?? 0) + 4)
  expect(run.reportNow()?.tests).toHaveLength(4)
})

const labels = (command: string, output: string, isError: boolean) => testsOf(command, output, isError).map(one => [one.cmd, one.ok])

test('a check gets the whole call’s exit code only when it runs last; otherwise its own "<name> exit N" line, or no entry; two checks never share one parsed result', () => {
  expect(labels('tsc -p . --noEmit > "$L" 2>&1; echo "tsc exit $?"; git status', 'tsc exit 2\n', false)).toEqual([['tsc · exit 2', false]])
  expect(labels('tsc -p . && npm test', 'Exit code 1\nnpm ERR! test failed', true)).toEqual([['npm test · exit 1', false]])
  expect(labels('npm test; pytest', '3 passed', false)).toEqual([['pytest · exit 0', true]])
  expect(labels('"$E" plugin test . | tail -4', ' 186 pass\n 0 fail', false)).toEqual([['plugin test · 186 pass', true]])
})

test('a parsed pass count still fails when the check’s exit status is not 0', () => {
  expect(labels('pytest -q', '5 passed, 2 errors in 0.3s', true)).toEqual([['pytest · 5 passed · exit 1', false]])
  expect(labels('pytest -q', '5 passed in 0.3s', false)).toEqual([['pytest · 5 passed', true]])
})

test('reading, copying, diffing or staging a test file is no run; neither is a test word after echo, grep or ls', () => {
  for (const command of ['sed -n 1,5p ./hooks/persona.test.sh', 'git diff hooks/persona.test.sh', 'cp tests/test_x.sh /tmp/', 'chmod +x ./test_x.sh', 'cat ./test_x.sh', 'git add tests/test_hooks.py', 'echo npm test', 'grep plugin test x', 'ls go test.txt'])
    expect([command, recordsTests(command)]).toEqual([command, false])
  for (const command of ['"$E" plugin test .', '~/bin/claude plugin validate --strict .', 'sh hooks/persona.test.sh', './hooks/persona.test.sh', 'bash scripts/test_hooks.sh', 'go test ./...'])
    expect([command, recordsTests(command)]).toEqual([command, true])
})

test('launchers and env prefixes still count; tsc version and help flags do not; a heredoc keeps the rest of its opening line; bun test parses pass and fail', () => {
  for (const command of ['bunx tsc', 'pnpm exec tsc', 'FOO=1 tsc', 'uv run pytest', 'poetry run pytest -q', 'npx --yes tsc -p .', 'time pytest', 'bun x vitest run', 'python3 -m pytest'])
    expect([command, recordsTests(command)]).toEqual([command, true])
  for (const command of ['tsc --version', 'tsc -v', 'tsc -h', 'tsc --help']) expect([command, recordsTests(command)]).toEqual([command, false])
  expect(recordsTests('cat <<EOF > x && pytest\nbody\nEOF')).toBe(true)
  expect(labels('bun test', ' 12 pass\n 1 fail', true)).toEqual([['bun test · 12 pass · 1 fail', false]])
})

test('a session nobody engaged records nothing and asks the app nothing, whatever the events', async () => {
  const run = world()
  await run.begin()
  await run.fire('turn.start', { text: 'go', turnId: 't1' })
  await run.fire('classic.PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'ls' } })
  await run.bash('cd ~/dotfiles && git commit -m "feat(mods): x"')
  await settle()
  expect(run.asked).toEqual([])
  expect(run.reportNow()).toBeUndefined()
})

test('the role is asked once and cached, plain or worker, however many events follow', async () => {
  for (const parent of ['', MASTER]) {
    const run = world(parent)
    await run.start()
    for (const turnId of ['t1', 't2', 't3']) {
      await run.fire('turn.start', { text: 'go', turnId })
      await run.fire('classic.PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'ls' } })
      await run.fire('classic.Notification', { notification_type: 'permission_prompt', message: 'Allow Bash' })
      await run.end(ended(turnId))
    }
    await engage(run.$ as never)
    expect(run.asked).toEqual(['get_session self'])
  }
})

test('a permission request never waits for the app: it answers while the role lookup is still open', async () => {
  const run = world()
  await run.begin()
  run.hold('mcp')
  void engage(run.$ as never)
  await settle()
  const answered = run.fire('classic.PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }).then(() => true)
  expect(await Promise.race([answered, settle().then(() => false)])).toBe(true)
  const notified = run.fire('classic.Notification', { notification_type: 'permission_prompt', message: 'Allow Bash' }).then(() => true)
  expect(await Promise.race([notified, settle().then(() => false)])).toBe(true)
  run.release()
})

test('a session read is cached per id, and a failed one is not asked again before the retry time', async () => {
  const run = world()
  await run.begin()
  run.fail('local_gone')
  const ask = (id: string) => sessionFacts(run.$ as never, id).then(() => 'ok', () => 'failed')
  expect([await ask('local_a'), await ask('local_a'), await ask('local_a')]).toEqual(['ok', 'ok', 'ok'])
  expect([await ask('local_gone'), await ask('local_gone'), await ask('local_gone')]).toEqual(['failed', 'failed', 'failed'])
  expect(run.asked).toEqual(['get_session local_a', 'get_session local_gone'])
})

test('a restarted worker engages on the master’s ask and consumes it', async () => {
  const before = { v: 1, kind: 'status', session: SELF, engineId: 'old', parent: MASTER, seq: 41, at: 1, run: { isRunning: false }, modelAt: 1, state: 'waiting', activity: [], commits: [], tests: [], files: [] }
  const run = world(MASTER, { [FILE]: JSON.stringify(before) })
  await run.begin()
  expect(await run.receive(askText({ from: MASTER, at: NOW }))).toEqual({ consumed: expect.stringContaining('ask') })
  expect(run.reportNow()?.seq).toBe(43)
})

test('a body without a model is asked again, one with a model is cached', async () => {
  const run = world()
  await run.begin()
  await sessionFacts(run.$ as never, 'local_nomodel')
  await sessionFacts(run.$ as never, 'local_nomodel')
  expect(run.asked).toEqual(['get_session local_nomodel', 'get_session local_nomodel'])
})

test('a relative or non-repo cd never becomes the git directory', async () => {
  const run = world()
  await run.start()
  await run.bash('cd ~/dotfiles && git commit -m "feat(mods): x"')
  const dotfiles = `${HOME}/dotfiles`
  await run.bash('cd hooks && git commit -m "broken"')
  await run.bash('tsc -p . --noEmit')
  expect(run.reportNow()?.git).toEqual({ branch: 'main', dirty: 1, ahead: 2, at: NOW, path: dotfiles })
  run.breakGit('/tmp')
  await run.bash('cd /tmp && tsc -p . --noEmit')
  await run.end(ended('t1'))
  expect(run.ran.at(-1)).toEqual(['git', '--no-optional-locks', '-C', dotfiles, 'status', '--porcelain=v2', '--branch'])
  expect(run.reportNow()?.git?.path).toBe(dotfiles)
  const calls = run.ran.length
  await run.bash('cd /tmp && tsc -p . --noEmit')
  expect(run.ran.length).toBe(calls)
})

test('a rejected place is checked again when git is named, but not again within 30 s', async () => {
  const run = world()
  await run.start()
  run.breakGit('/home/me/new')
  await run.bash('cd ~/new && tsc -p . --noEmit')
  const gits = () => run.ran.filter(argv => argv.includes('-C') && argv[argv.indexOf('-C') + 1] === '/home/me/new').length
  expect(gits()).toBe(1)
  await run.bash('cd ~/new && tsc -p . --noEmit')
  expect(gits()).toBe(1)
  run.breakGit('')
  await run.bash('cd ~/new && git commit -m "broken"')
  expect(gits()).toBe(2)
  expect(run.reportNow()?.git?.path).toBe('/home/me/new')
})

test('a rejected place is checked once more after 30 s even without git in the command', async () => {
  const run = world()
  await run.start()
  run.breakGit('/home/me/new')
  await run.bash('cd ~/new && tsc -p . --noEmit')
  const gits = () => run.ran.filter(argv => argv.includes('-C') && argv[argv.indexOf('-C') + 1] === '/home/me/new').length
  const before = gits()
  run.later(31_000)
  run.breakGit('')
  await run.bash('cd ~/new && tsc -p . --noEmit')
  expect(gits()).toBe(before + 1)
  expect(run.reportNow()?.git?.path).toBe('/home/me/new')
})

test('a failed command does not reject its place, so the next one checks it again', async () => {
  const run = world()
  await run.start()
  run.breakGit('/home/me/new')
  await run.bash('cd ~/new && ls FAIL')
  run.breakGit('')
  await run.bash('cd ~/new && npm test')
  expect(run.reportNow()?.git?.path).toBe('/home/me/new')
})

test('a successful check clears the rejection, so a later return to the place checks again', async () => {
  const run = world()
  await run.start()
  run.breakGit('/home/me/p')
  await run.bash('cd ~/p && tsc -p . --noEmit')
  run.breakGit('')
  await run.bash('cd ~/p && git status')
  await run.bash('cd ~/q && git status')
  expect(run.reportNow()?.git?.path).toBe('/home/me/q')
  await run.bash('cd ~/p && tsc -p . --noEmit')
  expect(run.reportNow()?.git?.path).toBe('/home/me/p')
})

test('any successful check clears the rejection, so a rejected place is checked again after a commit elsewhere', async () => {
  const run = world()
  await run.start()
  run.breakGit('/home/me/new')
  await run.bash('cd ~/new && tsc -p . --noEmit')
  const gits = () => run.ran.filter(argv => argv.includes('-C') && argv[argv.indexOf('-C') + 1] === '/home/me/new').length
  await run.bash('git commit -m "feat: y"')
  await run.bash('cd ~/new && tsc -p . --noEmit')
  expect(gits()).toBe(2)
})

test('a path segment named git is not a git command: the rejected place is not checked again within 30 s', async () => {
  const run = world()
  await run.start()
  run.breakGit('/home/me/git/scratch')
  const gits = () => run.ran.filter(argv => argv.includes('-C') && argv[argv.indexOf('-C') + 1] === '/home/me/git/scratch').length
  await run.bash('cd ~/git/scratch && tsc -p . --noEmit')
  await run.bash('cd ~/git/scratch && tsc -p . --noEmit')
  expect(gits()).toBe(1)
})
