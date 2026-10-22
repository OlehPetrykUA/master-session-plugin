import type { ElementQuery, Engine, FoundElement, MountPointerEvent } from 'claude-code/testing'
import { mock } from 'claude-code/testing'
import type { AgentSpawnInput, On } from 'claude-code'

import type { Live } from '../../types'

export const HOME = '/home/me'
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
  let sessions = [
    { sessionId: 'local_env', name: 'env-e2e-test', title: 'Test and validate local agent environment', cwd: `${HOME}/dotfiles`, isRunning: true, isArchived: false, lastActivityAt: AT, startedBy: SELF },
    { sessionId: 'local_setup', name: 'setup-ui-redo', title: 'Redo toolkit setup UI', cwd: WORKTREE, isRunning: false, isArchived: false, lastActivityAt: AT, startedBy: SELF },
    { sessionId: 'local_old', name: 'stale-removal', title: 'Remove the stale mod', cwd: `${HOME}/dotfiles`, isRunning: false, isArchived: true, lastActivityAt: AT, startedBy: SELF },
    { sessionId: 'local_parent', name: 'parent', title: 'Someone else', cwd: '/elsewhere', isRunning: false, isArchived: false, lastActivityAt: AT },
  ]
  mock.env(on, { HOME })
  const clock = mock.clock(on, { now: 3_600_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['desktop' as const] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__master-session__${e.name}` } }))
  on('command.run', (_, e) => {
    ran.push(`${e.command} ${e.args}`)
    return { text: 'skill ran' }
  })
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.messages', () => ({ value: [] }))
  on('fs.stat', (_, e) => {
    const file = child.files?.[e.path]
    if (file === undefined) throw new Error('ENOENT')
    return { value: { kind: 'file' as const, size: file.length, mtimeMs: 1, isLink: false } }
  })
  on('fs.read', (_, e) => {
    const file = child.files?.[e.path]
    if (file === undefined) throw new Error('ENOENT')
    return { value: file }
  })
  on('session.id', () => ({ value: 'engine-test' }))
  on('fs.list', (_, e) => ({
    value: Object.entries(child.files ?? {})
      .filter(([path]) => path.startsWith(`${e.path}/`))
      .map(([path, file]) => ({ name: path.slice(e.path.length + 1), kind: 'file' as const, size: file.length, mtimeMs: 1, isLink: false })),
  }))
  on('mcp.call', (_, e) => {
    calls.push({ tool: e.tool, args: e.args })
    if (e.tool === 'get_session') {
      return e.args.session_id === 'self'
        ? text(child.parent ? { sessionId: 'local_worker', title: 'Worker chat', parentSessionId: child.parent } : { sessionId: SELF, title: 'Orbit Agents Toolkit Validator' })
        : text({ sessionId: e.args.session_id, createdAt: '1970-01-01T00:10:00.000Z', model: 'claude-opus-5-5', effort: 'xhigh', permissionMode: 'auto' })
    }
    if (e.tool === 'list_sessions') return text(sessions)
    if (e.tool === 'archive_session' || e.tool === 'unarchive_session') {
      const isArchived = e.tool === 'archive_session'
      sessions = sessions.map(one => (one.sessionId === e.args.session_id ? { ...one, isArchived } : one))
    }
    return text({ ok: true })
  })
  on('process.run', (_, e) => {
    const [, , , cwd, verb] = e.argv
    const stdout = verb === 'for-each-ref' ? 'x\nxorigin/main\n' : (GIT[`${cwd} ${verb}`] ?? '')
    return { value: { exitCode: stdout ? 0 : 128, stdout, stderr: stdout ? '' : 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { calls, opened, toasts, ran, clock }
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

declare const console: { log: (...values: unknown[]) => void }

export type Ui = { find: (query: ElementQuery) => Promise<FoundElement | undefined>; findAll: (query: ElementQuery) => Promise<FoundElement[]> }

export type Clickable = { pointer: (event: MountPointerEvent) => Promise<void> }

export async function click(ui: Clickable, key: string, x = 1, y = 1) {
  await ui.pointer({ type: 'down', x, y, button: 'left', in: key })
  await ui.pointer({ type: 'up', x, y, button: 'left', in: key })
}

export const hitsOf = async (ui: Ui) => (await ui.findAll({ type: 'Client' })).map(one => one.key ?? '')

export async function dump(name: string, ui: Ui) {
  const all = await ui.findAll({})
  const rows = all.map(one => [one.type, one.key ?? '', one.text, one.type === 'Svg' ? one.props.alt : one.type === 'Box' ? (one.props.width ?? '') : ''])
  console.log(`DUMP ${name} ${JSON.stringify(rows)}`)
}

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

export const textsOf = async (ui: Ui) => (await ui.findAll({ type: 'Text' })).map(one => one.text)

export const altsOf = async (ui: Ui) => (await ui.findAll({ type: 'Svg' })).map(one => one.props.alt)

export const buttonsOf = async (ui: Ui) => (await ui.findAll({ type: 'Button' })).map(one => one.key ?? '')

export const labelOf = async (ui: Ui, key: string) => String((await ui.find({ key }))?.text ?? '').replace(/[   ]/g, ' ').trim()

export const MASTER = 'local_master'

export const MASTER_TITLE = 'Orbit Agents Toolkit Validator'

export type Child = { parent?: string; files?: Record<string, string> }

export function childOf(at: number, board: unknown = BOARD): Child {
  const file = JSON.stringify({ v: 1, kind: 'board', at, masterId: MASTER, masterTitle: MASTER_TITLE, board })
  return { parent: MASTER, files: { [`${HOME}/.claude/state/master-session/boards/${MASTER}.json`]: file } }
}
