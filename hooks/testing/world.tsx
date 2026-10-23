import type { ElementQuery, Engine, FoundElement, MountPointerEvent } from 'claude-code/testing'
import { mock, test } from 'claude-code/testing'
import type { AgentSpawnInput, On } from 'claude-code'

import type { Live } from '../../types'

export const HOME = '/home/me'
const PLUGIN_ORIGIN = { kind: 'plugin', name: 'master-session' }
export const SELF = 'local_validator'
export const WORKTREE = `${HOME}/.claude/worktrees/wt-toolkit-setup-ui`
export const TOOLKIT = `${HOME}/Work/toolkit`
export const BOARD_TOOL = 'mcp__master-session__board' as const

export const BOARD = {
  tick: '19:46',
  sessions: [
    {
      id: 'local_env',
      name: 'env-e2e-test',
      title: 'Test and validate local agent environment',
      state: 'needs-you',
      progress: 'step 4 of 6 — fix pass',
      now: 're-running test_hooks',
      next: 'commit',
      needsYou: 'Approve the settings.json edit',
    },
    { id: 'local_setup', name: 'setup-ui-redo', state: 'waiting', progress: 'step 2 of 5 — mockups', now: 'waiting for the go' },
  ],
  needsYou: ['Approve the settings.json edit in env-e2e-test'],
  repos: ['~/dotfiles', '~/Work/toolkit'],
}

export const CHAT_BOARD = `🕐 **Tick 19:20** · 🟢 1 working · 🔴 0 need you · ✅ 1 done

| | 🤖 Session | ▸ Now | → Next |
|---|---|---|---|
| 🟢 | [setup-ui-redo](#local_setup) | rewriting setup screens | smoke, check, amend |
| ✅ | [conductor-redo](#local_conductor) | done · 07ab1b7 · archive? | — |

#### 🟢 [setup-ui-redo](#local_setup) — checkbox setup UI
| | |
|---|---|
| ⏱ Time | started 19:00 (20 min) · last active just now |
| 📍 Progress | step 3 of 5 — build screens |
| ▸ Now | rewriting setup.sh screens (+27 −32) |
| ⚠️ Risk | bash 3.2 key handling unproven |
| → Next | smoke on /bin/bash, check, amend · ETA ~20 min |

| | 📦 Repo | 🌿 Branch | ✏️ Uncommitted | ⇅ Ahead/behind | 🔖 Last |
|---|---|---|---|---|---|
| ✅ | ~/dotfiles | master | 0 | no upstream | ab8ae48 |

🙋 **Needs you:** 1. Approve the plan`

export const typed = (command: string, args: string) => ({
  command,
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 100 },
})

export const text = (body: unknown) => ({ value: { content: [{ type: 'text' as const, text: JSON.stringify(body) }], isError: false } })

export const GIT: Record<string, string> = {
  [`${HOME}/dotfiles worktree`]: `worktree ${HOME}/dotfiles\nHEAD 76c7dc89a954689e494c0ab555e7bacd7d28a796\nbranch refs/heads/master\n\n`,
  [`${WORKTREE} worktree`]: `worktree ${TOOLKIT}\nHEAD d575596be1713c300bf1d8737355ceda0cb3ded3\nbranch refs/heads/main\n\nworktree ${WORKTREE}\nHEAD 0a4621c5737c70d482f20e7ea07591e9c117d6a1\ndetached\n\n`,
  [`${HOME}/dotfiles status`]: '# branch.oid 76c7dc8\n# branch.head master\n1 .M N... 100644 100644 100644 a b hooks.py\n',
  [`${TOOLKIT} status`]: '# branch.oid d575596\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n',
  [`${WORKTREE} status`]: '# branch.oid 0a4621c\n# branch.head (detached)\n? new.sh\n',
}

export const AT = '1970-01-01T00:50:00.000Z'

const stampOf = (file: string) => [...file].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1_000_000_007, 7)

export const SPAWN: AgentSpawnInput = {
  tool_use_id: 'toolu_1',
  prompt: 'Read the docs.',
  description: 'Docs lookup',
  subagentType: 'master-session:researcher',
  provider: { plugin: 'master-session', tier: 'user' },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
}

export function world(on: On, child: Child = {}) {
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  const opened: string[] = []
  const toasts: string[] = []
  const ran: string[] = []
  const scans = { messages: 0 }
  const tools: string[] = []
  let sessions = [
    ...(child.isBare
      ? []
      : [
        { sessionId: 'local_env', name: 'env-e2e-test', title: 'Test and validate local agent environment', cwd: `${HOME}/dotfiles`, isRunning: true, isArchived: false, lastActivityAt: AT, startedBy: SELF },
        { sessionId: 'local_setup', name: 'setup-ui-redo', title: 'Redo toolkit setup UI', cwd: WORKTREE, isRunning: false, isArchived: false, lastActivityAt: AT, startedBy: SELF },
        { sessionId: 'local_old', name: 'stale-removal', title: 'Remove the stale mod', cwd: `${HOME}/dotfiles`, isRunning: false, isArchived: true, lastActivityAt: AT, startedBy: SELF },
        { sessionId: 'local_parent', name: 'parent', title: 'Someone else', cwd: '/elsewhere', isRunning: false, isArchived: false, lastActivityAt: AT },
      ]),
    ...(child.sessions ?? []),
  ]
  if (child.parent === MASTER) {
    child.files ??= {}
    child.files[`${HOME}/.claude/state/master-session/boards/${MASTER}.json`] ??= '{}'
  }
  mock.env(on, { HOME })
  const clock = mock.clock(on, { now: 3_600_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: [...(child.surfaces ?? ['desktop' as const])] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => {
    tools.push(e.name)
    return { value: { tool: `mcp__master-session__${e.name}` } }
  })
  on('command.run', (_, e) => {
    ran.push(`${e.command} ${e.args}`)
    return { text: 'skill ran' }
  })
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: child.isPlaced === false ? { isPlaced: false as const, reason: 'no surface draws it' } : { isPlaced: true as const } }
  })
  on('ui.panes', () => ({ value: child.isPaneOpen === false ? [] : [{ id: 'master-session', title: 'Master session', isShown: !child.isPaneHidden, isFocused: false, isPlaced: child.isPlaced ?? true }] }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.messages', () => {
    scans.messages += 1
    return { value: [] }
  })
  on('fs.stat', (_, e) => {
    const file = child.files?.[e.path]
    if (file === undefined) throw new Error('ENOENT')
    return { value: { kind: 'file' as const, size: file.length, mtimeMs: stampOf(file), isLink: false } }
  })
  on('fs.read', (_, e) => {
    const file = child.files?.[e.path]
    if (file === undefined) throw new Error('ENOENT')
    return { value: file }
  })
  on('session.id', () => ({ value: 'engine-test' }))
  const flights = { git: { active: 0, peak: 0, started: 0 }, list: { active: 0, peak: 0, started: 0 } }
  const slowly = async (kind: 'git' | 'list', ms: number | undefined) => {
    const flight = flights[kind]
    flight.active += 1
    flight.started += 1
    flight.peak = Math.max(flight.peak, flight.active)
    if (ms) await clock.sleep(ms)
    flight.active -= 1
  }
  on('fs.list', async (_, e) => {
    await slowly('list', child.slowMs?.list)
    return {
      value: Object.entries(child.files ?? {})
        .filter(([path]) => path.startsWith(`${e.path}/`))
        .map(([path, file]) => ({ name: path.slice(e.path.length + 1), kind: 'file' as const, size: file.length, mtimeMs: stampOf(file), isLink: false })),
    }
  })
  on('mcp.call', (_, e) => {
    calls.push({ tool: e.tool, args: e.args })
    if (e.tool === 'get_session' && child.isLookupDown) return { value: { content: [{ type: 'text' as const, text: 'down' }], isError: true } }
    if (e.tool === 'get_session') {
      return e.args.session_id === 'self'
        ? text(
            child.parent
              ? { sessionId: 'local_worker', title: 'Worker chat', parentSessionId: child.parent }
              : { sessionId: SELF, title: 'Orbit Agents Toolkit Validator', ...(child.origin ? { parentSessionId: child.origin, detached: child.isDetached ?? true } : {}) },
          )
        : text({ sessionId: e.args.session_id, ...(e.args.session_id === child.parent ? { title: MASTER_TITLE } : {}), createdAt: '1970-01-01T00:10:00.000Z', model: 'claude-opus-5-5', effort: 'xhigh', permissionMode: 'auto' })
    }
    const failure = e.tool === 'list_sessions' ? child.listError?.() : undefined
    if (failure) return { value: { content: [{ type: 'text' as const, text: failure }], isError: true } }
    if (e.tool === 'list_sessions') return text(sessions.filter(one => e.args.include_archived === true || !one.isArchived).slice(0, Number(e.args.limit ?? 20)))
    const refusal = e.tool === 'archive_session' ? child.archiveError : e.tool === 'unarchive_session' ? child.unarchiveError : undefined
    if (refusal) return { value: { content: [{ type: 'text' as const, text: refusal }], isError: true } }
    if ((e.tool === 'archive_session' && !child.stuck) || e.tool === 'unarchive_session') {
      const isArchived = e.tool === 'archive_session'
      sessions = sessions.map(one => (one.sessionId === e.args.session_id ? { ...one, isArchived } : one))
    }
    return text({ ok: true })
  })
  const gits: string[][] = []
  on('process.run', async (_, e) => {
    gits.push([...e.argv])
    await slowly('git', child.slowMs?.git)
    const [, , , cwd, verb] = e.argv
    const stdout = verb === 'for-each-ref' ? 'x\nxorigin/main\n' : (child.git?.[`${cwd} ${e.argv.slice(4).join(' ')}`] ?? child.git?.[`${cwd} ${verb}`] ?? GIT[`${cwd} ${verb}`] ?? '')
    return { value: { exitCode: stdout ? 0 : 128, stdout, stderr: stdout ? '' : 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { calls, opened, toasts, ran, clock, gits, flights, scans, tools }
}

export const PANE = {
  plugin: 'master-session',
  component: 'Pane',
  requestId: 'master-session',
  props: {
    title: 'Master session',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

export const BAND = {
  plugin: 'master-session',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

export type Ui = { find: (query: ElementQuery) => Promise<FoundElement | undefined>; findAll: (query: ElementQuery) => Promise<FoundElement[]> }

export type Clickable = { pointer: (event: MountPointerEvent) => Promise<void> }

export async function click(ui: Clickable, key: string, x = 1, y = 1) {
  await ui.pointer({ type: 'down', x, y, button: 'left', in: key })
  await ui.pointer({ type: 'up', x, y, button: 'left', in: key })
}

export const hitsOf = async (ui: Ui) => (await ui.findAll({ type: 'Client' })).map(one => one.key ?? '')

export async function started($: Engine, on: On, board: unknown = BOARD, child: Child = {}) {
  const run = world(on, child)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  const answer = await $.tool.call({ tool: BOARD_TOOL, ...(board as typeof BOARD) })
  await run.clock.settle()
  return { ...run, answer }
}

export const liveOf = (archived: string[] = []): Live => ({
  self: SELF,
  title: '',
  error: '',
  at: 0,
  sessions: ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, title: '', cwd: '/', isRunning: true, isArchived: archived.includes(id), lastActivityAt: 0 })),
})

export async function pluginScroll($: Engine, input: { offset: number; by: number; bodyRows: number; contentRows: number }) {
  await ($.ui as unknown as { scroll: (input: unknown) => Promise<unknown> }).scroll({ component: 'Pane', requestId: 'master-session', ...input, origin: PLUGIN_ORIGIN })
}

export const textsOf = async (ui: Ui) => (await ui.findAll({ type: 'Text' })).map(one => one.text)

export const altsOf = async (ui: Ui) => (await ui.findAll({ type: 'Svg' })).map(one => one.props.alt)

export const buttonsOf = async (ui: Ui) => (await ui.findAll({ type: 'Button' })).map(one => one.key ?? '')

export const labelOf = async (ui: Ui, key: string) => String((await ui.find({ key }))?.text ?? '').replace(/[   ]/g, ' ').trim()

export const MASTER = 'local_master'

export const MASTER_TITLE = 'Orbit Agents Toolkit Validator'

export type Child = { isBare?: boolean; parent?: string; origin?: string; isDetached?: boolean; files?: Record<string, string>; sessions?: readonly Record<string, unknown>[]; listError?: () => string | undefined; git?: Record<string, string>; slowMs?: { git?: number; list?: number }; isPaneOpen?: boolean; isPaneHidden?: boolean; isPlaced?: boolean; surfaces?: readonly ('desktop' | 'terminal')[]; archiveError?: string; unarchiveError?: string; stuck?: boolean; isLookupDown?: boolean }

export function childOf(at: number, board: unknown = BOARD): Child {
  const file = JSON.stringify({ v: 1, kind: 'board', at, masterId: MASTER, board })
  return { parent: MASTER, files: { [`${HOME}/.claude/state/master-session/boards/${MASTER}.json`]: file } }
}

export const COLD_MS = 30_000

export function warmUp() {
  test('warm-up: a desktop and a terminal mount take this file’s cold engine start, under their own timeout', { timeoutMs: COLD_MS }, async ($, on) => {
    await started($, on)
    for (const surface of ['desktop', 'terminal'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.unmount()
    }
  })
}
